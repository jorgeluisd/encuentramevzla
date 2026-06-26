// NOTA: módulo SOLO de servidor (lo invoca la Server Action "use server", y un
// runner/worker de Node para ingestas batch). No usamos el paquete "server-only"
// para poder ejecutarlo también fuera de Next; getDb() falla si falta DATABASE_URL.

import { eq } from "drizzle-orm";
import { getDb } from "@registro/db/client";
import {
  auditLog,
  contacto,
  hospitales,
  ingresos,
  observacionesClinicas,
  personas,
  stagingFilas,
} from "@registro/db";
import {
  contentHash,
  esMenor,
  mapearColumnas,
  mapearFila,
  normalizarDocumento,
  normalizarNombre,
  parsearPacientes,
  scoreDedup,
  tokenSet,
} from "@registro/ingesta";

/**
 * Pipeline de ingesta de un Excel hospitalario:
 *   1. Parsear (detecta hoja + encabezado + mapea columnas).
 *   2. Preservar el dato CRUDO en `staging_filas` con content_hash (IDEMPOTENTE:
 *      solo se procesan las filas cuyo hash es NUEVO -> re-subir no duplica).
 *   3. Normalizar + DEDUP con scoring (ADR-003): cédula válida y nombre concuerda
 *      => fusiona; misma cédula con nombre distinto => CONFLICTO (no fusiona, a revisión).
 *   4. Escribir persona/ingreso (público) y teléfono/dirección/observaciones (sensible).
 *   5. Audit log de la operación.
 *
 * Reglas de privacidad aplicadas aquí:
 *   - Menores (edad<18) y fallecidos (heurística por observaciones) quedan marcados
 *     para que el RPC público los enrute a contacto humano, nunca al buscador abierto.
 */

export interface ResumenIngesta {
  hoja: string;
  filasLeidas: number;
  filasUnicas: number;
  stagingNuevas: number;
  stagingYaExistian: number;
  hospitales: number;
  personasNuevas: number;
  personasFusionadas: number;
  conflictosCedula: number;
  zonaGris: number;
  ingresosNuevos: number;
  menores: number;
  fallecidos: number;
}

const FALLECIDO_RE = /fallec|[óo]bito|deceso|muert|expir/i;

/** Documento válido para usarse como señal fuerte: al menos 6 dígitos. */
function docEsValido(docNorm: string): boolean {
  return docNorm.replace(/\D/g, "").length >= 6;
}

interface PersonaMem {
  id: string;
  nombreNormalizado: string;
  docNumeroNormalizado: string | null;
  esMenor: boolean;
  edad: number | null;
  estado: string;
}

export async function procesarExcel(
  buffer: Uint8Array,
  opts: { subidoPor?: string | null } = {},
): Promise<ResumenIngesta> {
  const db = getDb();
  const { hoja, headers, filas } = parsearPacientes(buffer);
  const mapa = mapearColumnas(headers);
  const archivoId = crypto.randomUUID();

  // --- Dedupe dentro del archivo por content_hash (evita afectar la misma fila 2x) ---
  const vistos = new Set<string>();
  const registros = filas
    .map((fila) => ({ fila, hash: contentHash(fila), reg: mapearFila(fila, mapa) }))
    .filter((x) => (vistos.has(x.hash) ? false : (vistos.add(x.hash), true)));

  // --- Resolver hospitales (cache nombre -> id, crea si no existe) ---
  const hospCache = new Map<string, string>(
    (await db.select({ id: hospitales.id, nombre: hospitales.nombre }).from(hospitales)).map(
      (h) => [h.nombre, h.id] as const,
    ),
  );
  async function hospitalId(nombre: string): Promise<string> {
    const key = nombre.trim();
    const existente = hospCache.get(key);
    if (existente) return existente;
    const [creado] = await db
      .insert(hospitales)
      .values({ nombre: key })
      .returning({ id: hospitales.id });
    hospCache.set(key, creado!.id);
    return creado!.id;
  }
  for (const { reg } of registros) {
    if (reg.hospitalNombre) await hospitalId(reg.hospitalNombre);
  }

  // --- Upsert idempotente a staging; SOLO procesamos las filas con hash nuevo ---
  const stagingRows = registros.map(({ fila, hash, reg }) => ({
    archivoId,
    contentHash: hash,
    filaCruda: fila,
    hospitalId: reg.hospitalNombre ? hospCache.get(reg.hospitalNombre.trim())! : null,
    subidoPor: opts.subidoPor ?? null,
  }));
  const insertadas = stagingRows.length
    ? await db
        .insert(stagingFilas)
        .values(stagingRows)
        .onConflictDoNothing({ target: stagingFilas.contentHash })
        .returning({ hash: stagingFilas.contentHash })
    : [];
  const nuevosHashes = new Set(insertadas.map((r) => r.hash));
  const aProcesar = registros.filter((x) => nuevosHashes.has(x.hash));

  // --- Snapshot en memoria para dedup ---
  const existentes: PersonaMem[] = (
    await db
      .select({
        id: personas.id,
        nombreNormalizado: personas.nombreNormalizado,
        docNumeroNormalizado: personas.docNumeroNormalizado,
        esMenor: personas.esMenor,
        edad: personas.edad,
        estado: personas.estado,
      })
      .from(personas)
  ).map((p) => ({ ...p, estado: String(p.estado) }));

  const ingresosSet = new Map<string, string>(
    (
      await db
        .select({ id: ingresos.id, p: ingresos.personaId, h: ingresos.hospitalId })
        .from(ingresos)
    ).map((i) => [`${i.p}|${i.h}`, i.id] as const),
  );
  const contactoSet = new Set<string>();

  const r: ResumenIngesta = {
    hoja,
    filasLeidas: filas.length,
    filasUnicas: registros.length,
    stagingNuevas: nuevosHashes.size,
    stagingYaExistian: registros.length - nuevosHashes.size,
    hospitales: hospCache.size,
    personasNuevas: 0,
    personasFusionadas: 0,
    conflictosCedula: 0,
    zonaGris: 0,
    ingresosNuevos: 0,
    menores: 0,
    fallecidos: 0,
  };

  for (const { reg } of aProcesar) {
    if (!reg.nombre) continue;
    const nombreNorm = normalizarNombre(reg.nombre);
    if (!nombreNorm) continue;
    const tokens = tokenSet(reg.nombre);
    const docNorm = reg.docNumero ? normalizarDocumento(reg.docNumero) : "";
    const docValido = docNorm !== "" && docEsValido(docNorm);
    const menor = esMenor(reg.edad);
    const fallecido = !!reg.observaciones && FALLECIDO_RE.test(reg.observaciones);

    // --- Decisión de match (ADR-003) ---
    let mergeTarget: PersonaMem | null = null;
    let accion: "nueva" | "fusionada" | "conflicto" | "zona_gris" = "nueva";

    const porDoc = docValido
      ? existentes.find((p) => p.docNumeroNormalizado === docNorm)
      : undefined;

    if (porDoc) {
      if (scoreDedup(nombreNorm, porDoc.nombreNormalizado) >= 0.5) {
        mergeTarget = porDoc;
        accion = "fusionada";
      } else {
        accion = "conflicto"; // misma cédula, persona distinta -> NO fusionar
      }
    } else {
      let best: PersonaMem | null = null;
      let bestScore = 0;
      for (const p of existentes) {
        const s = scoreDedup(nombreNorm, p.nombreNormalizado);
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      if (best && bestScore >= 0.92) {
        mergeTarget = best;
        accion = "fusionada";
      } else if (best && bestScore >= 0.8) {
        accion = "zona_gris";
      }
    }

    let personaId: string;
    if (mergeTarget) {
      personaId = mergeTarget.id;
      const updates: Partial<typeof personas.$inferInsert> = {};
      if (menor && !mergeTarget.esMenor) updates.esMenor = true;
      if (docValido && !mergeTarget.docNumeroNormalizado)
        updates.docNumeroNormalizado = docNorm;
      if (fallecido && mergeTarget.estado !== "fallecido") updates.estado = "fallecido";
      if (Object.keys(updates).length) {
        await db.update(personas).set(updates).where(eq(personas.id, personaId));
        Object.assign(mergeTarget, updates);
      }
      r.personasFusionadas++;
    } else {
      const [creada] = await db
        .insert(personas)
        .values({
          nombreNormalizado: nombreNorm,
          tokensNombre: tokens,
          edad: reg.edad,
          docNumeroNormalizado: docValido ? docNorm : null,
          estado: fallecido ? "fallecido" : "ingresado",
          esMenor: menor,
        })
        .returning({ id: personas.id });
      personaId = creada!.id;
      existentes.push({
        id: personaId,
        nombreNormalizado: nombreNorm,
        docNumeroNormalizado: docValido ? docNorm : null,
        esMenor: menor,
        edad: reg.edad,
        estado: fallecido ? "fallecido" : "ingresado",
      });
      if (accion === "conflicto") {
        r.conflictosCedula++;
        await db.insert(auditLog).values({
          actorId: opts.subidoPor ?? null,
          accion: "dedup_conflicto_cedula",
          entidad: "personas",
          entidadId: personaId,
          payload: { docNorm, nombreNorm, motivo: "misma cédula, nombre distinto" },
        });
      } else if (accion === "zona_gris") {
        r.zonaGris++;
        await db.insert(auditLog).values({
          actorId: opts.subidoPor ?? null,
          accion: "dedup_zona_gris",
          entidad: "personas",
          entidadId: personaId,
          payload: { nombreNorm, motivo: "similitud media, requiere revisión humana" },
        });
      } else {
        r.personasNuevas++;
      }
    }

    if (menor) r.menores++;
    if (fallecido) r.fallecidos++;

    // --- Ingreso (persona ↔ hospital); permite traslados (varios por persona) ---
    let ingresoId: string | null = null;
    if (reg.hospitalNombre) {
      const hId = hospCache.get(reg.hospitalNombre.trim())!;
      const key = `${personaId}|${hId}`;
      const existente = ingresosSet.get(key);
      if (existente) {
        ingresoId = existente;
      } else {
        const [ing] = await db
          .insert(ingresos)
          .values({
            personaId,
            hospitalId: hId,
            estado: fallecido ? "fallecido" : "ingresado",
            observacionesPublicasFlag: false,
          })
          .returning({ id: ingresos.id });
        ingresoId = ing!.id;
        ingresosSet.set(key, ingresoId);
        r.ingresosNuevos++;
      }
    }

    // --- Datos SENSIBLES (schema aislado) ---
    if (reg.telefono || reg.direccion) {
      const ck = `${personaId}|${reg.telefono ?? ""}|${reg.direccion ?? ""}`;
      if (!contactoSet.has(ck)) {
        await db
          .insert(contacto)
          .values({ personaId, telefono: reg.telefono, direccion: reg.direccion });
        contactoSet.add(ck);
      }
    }
    if (reg.observaciones && ingresoId) {
      await db
        .insert(observacionesClinicas)
        .values({ ingresoId, texto: reg.observaciones, llegoCon: null });
    }
  }

  // --- Audit log de la operación completa ---
  await db.insert(auditLog).values({
    actorId: opts.subidoPor ?? null,
    accion: "ingesta_excel",
    entidad: "staging_filas",
    entidadId: null,
    payload: { archivoId, ...r },
  });

  return r;
}
