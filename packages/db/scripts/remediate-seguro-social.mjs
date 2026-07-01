// Remediación dirigida: "Seguro Social La Guaira" es una RE-CARGA CORRUPTA de pacientes de
// "Hospital José María Vargas - La Guaira" (no existe en la verdad; nombre invertido + cédula
// con un "0" extra). Ver hallazgo 2026-07-01 y draft/duplicados-ss-jmv.csv.
//
// Pasos (ADR-0007, DRY-RUN por defecto; --apply escribe):
//   Para cada paciente con ingreso en Seguro Social (SS):
//     A) MERGE   — existe UN gemelo canónico (mismo token-set, con ingreso Vargas y SIN SS):
//                  se borra el ingreso SS, se trasladan el resto al canónico, se colapsan
//                  ingresos duplicados por hospital, se conserva la cédula BUENA (nunca la +0)
//                  y se elimina el registro espurio.
//     B) STRIP   — sin gemelo pero con otros ingresos: solo se borra su ingreso SS.
//     C) DELETE  — sin gemelo y solo tenía SS: queda huérfano → se elimina (salvo que su cédula
//                  esté en la verdad → posible persona real, se deja y se reporta).
//     SKIP-MULTI — varios canónicos posibles (homónimos): NO se toca, se reporta para revisión.
//   Punto 4: se DESACTIVA el hospital Seguro Social (active=false). No se borra la fila.
//
// Uso: DATABASE_URL=<url> node packages/db/scripts/remediate-seguro-social.mjs [--apply]
import postgres from "postgres";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { banner, connectionFromEnv, isValidDoc, parseFlags } from "./_dedup-lib.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const xlsx = require(require.resolve("xlsx", { paths: [path.join(ROOT, "apps/web"), ROOT] }));
const TRUTH_FILE = "draft/data/28JUN26 01.10 Pacientes Consolidados Hospitales Venezuela.xlsx";
const SS_NAME = "Seguro Social La Guaira";
const JMV_NAME = "Hospital José María Vargas - La Guaira";

const nDoc = (r) =>
  String(r ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const keyOf = (tokens) => [...(tokens ?? [])].sort().join(" ");

// Verdad: solo la usamos para no borrar por error una persona real (paso C).
function loadTruthDocs() {
  if (!fs.existsSync(TRUTH_FILE)) {
    console.error(`⛔ No existe el Excel de verdad: ${TRUTH_FILE}`);
    process.exit(1);
  }
  const wb = xlsx.read(fs.readFileSync(TRUTH_FILE), { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["🔍 BUSCAR PACIENTES"], { header: 1, blankrows: false });
  const hi = rows.findIndex((r) => (r || []).some((c) => /apellidos y nombres/i.test(String(c))));
  const H = (rows[hi] || []).map((c) => String(c).trim().toUpperCase());
  const cDoc = H.findIndex((h) => h.includes("CÉDULA") || h.includes("CEDULA"));
  const docs = new Set();
  for (let i = hi + 1; i < rows.length; i++) {
    const d = nDoc((rows[i] || [])[cDoc]);
    if (isValidDoc(d)) docs.add(d);
  }
  return docs;
}

// Colapsa ingresos duplicados del mismo hospital en un paciente (repunta notas clínicas).
async function collapseAdms(tx, pid) {
  const rows = await tx`
    SELECT id, hospital_id FROM public.admissions WHERE patient_id=${pid}
    ORDER BY hospital_id, created_at ASC, id ASC`;
  const kept = new Map();
  let removed = 0;
  for (const a of rows) {
    const k = kept.get(a.hospital_id);
    if (!k) { kept.set(a.hospital_id, a.id); continue; }
    await tx`UPDATE sensitive.clinical_notes SET admission_id=${k} WHERE admission_id=${a.id}`;
    await tx`DELETE FROM public.admissions WHERE id=${a.id}`;
    removed++;
  }
  return removed;
}

// Borra los ingresos SS de un paciente (+ sus notas clínicas). Devuelve cuántos borró.
async function deleteSSAdms(tx, pid, ssId) {
  const adms = await tx`SELECT id FROM public.admissions WHERE patient_id=${pid} AND hospital_id=${ssId}`;
  const ids = adms.map((r) => r.id);
  if (ids.length) {
    await tx`DELETE FROM sensitive.clinical_notes WHERE admission_id = ANY(${ids}::uuid[])`;
    await tx`DELETE FROM public.admissions WHERE id = ANY(${ids}::uuid[])`;
  }
  return ids.length;
}

async function mergePair(tx, sId, cId, ssId) {
  const [S] = await tx`SELECT id, is_minor, status, age, normalized_doc_number AS doc FROM public.patients WHERE id=${sId}`;
  const [C] = await tx`SELECT id, is_minor, status, age, normalized_doc_number AS doc FROM public.patients WHERE id=${cId}`;
  if (!S || !C) return { removed: 0 };
  await deleteSSAdms(tx, S.id, ssId);
  await tx`UPDATE public.admissions SET patient_id=${C.id} WHERE patient_id=${S.id}`;
  await tx`UPDATE sensitive.contacts SET patient_id=${C.id} WHERE patient_id=${S.id}`;
  const removed = await collapseAdms(tx, C.id);
  const anyMinor = S.is_minor || C.is_minor;
  const anyDeceased = S.status === "deceased" || C.status === "deceased";
  const age = C.age ?? S.age ?? null;
  const doc = isValidDoc(C.doc) ? C.doc : null; // nunca heredar la cédula +0 del espurio
  await tx`UPDATE public.patients
           SET is_minor=${anyMinor}, status=${anyDeceased ? "deceased" : C.status}::public.person_status,
               age=${age}, normalized_doc_number=${doc}
           WHERE id=${C.id}`;
  await tx`DELETE FROM public.patients WHERE id=${S.id}`;
  await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
           VALUES ('patients_merged','patient',${C.id}, ${tx.json({ mergedFrom: S.id, via: "seguro-social-remediation" })})`;
  await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
           SELECT 'review_resolved','patient',${C.id}, ${tx.json({ decision: "resolved", via: "seguro-social-remediation" })}
           WHERE NOT EXISTS (SELECT 1 FROM public.audit_log r WHERE r.action='review_resolved' AND r.entity_id=${C.id})`;
  return { removed };
}

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

try {
  banner("Remediación Seguro Social La Guaira (load corrupto)", { apply, isLocal });
  const truthDocs = loadTruthDocs();

  const [ss] = await sql`SELECT id, active FROM public.hospitals WHERE name=${SS_NAME}`;
  const [jmv] = await sql`SELECT id FROM public.hospitals WHERE name=${JMV_NAME}`;
  if (!ss || !jmv) throw new Error("No se encontraron los hospitales por nombre.");
  const SS_ID = ss.id, JMV_ID = jmv.id;

  // Universo relevante: pacientes con ingreso en SS o en JMV, con conteos por hospital.
  const uni = await sql`
    SELECT p.id, p.normalized_name AS name, p.name_tokens AS tokens, p.normalized_doc_number AS doc,
           count(a.*)::int AS total_adms,
           count(a.*) FILTER (WHERE a.hospital_id=${SS_ID})::int AS ss_adms,
           bool_or(a.hospital_id=${JMV_ID}) AS has_jmv
    FROM public.patients p JOIN public.admissions a ON a.patient_id=p.id
    WHERE EXISTS (SELECT 1 FROM public.admissions x WHERE x.patient_id=p.id AND x.hospital_id IN (${SS_ID},${JMV_ID}))
    GROUP BY p.id`;

  const canonicalByKey = new Map();
  for (const r of uni) {
    if (r.ss_adms === 0 && r.has_jmv) {
      const k = keyOf(r.tokens);
      const l = canonicalByKey.get(k) ?? [];
      l.push(r);
      canonicalByKey.set(k, l);
    }
  }

  const ssRecords = uni.filter((r) => r.ss_adms > 0);
  const plan = { merge: [], strip: [], del: [], keepReview: [], skipMulti: [] };
  for (const s of ssRecords) {
    const cands = (canonicalByKey.get(keyOf(s.tokens)) ?? []).filter((c) => c.id !== s.id);
    if (cands.length === 1) {
      plan.merge.push({ s, c: cands[0] });
    } else if (cands.length > 1) {
      plan.skipMulti.push({ s, n: cands.length });
    } else {
      const nonSS = s.total_adms - s.ss_adms;
      if (nonSS > 0) plan.strip.push({ s });
      else if (isValidDoc(s.doc) && truthDocs.has(nDoc(s.doc))) plan.keepReview.push({ s });
      else plan.del.push({ s });
    }
  }

  console.log(`Hospitales: SS=${SS_ID} (active=${ss.active}) · JMV=${JMV_ID}`);
  console.log(`Pacientes con ingreso en Seguro Social: ${ssRecords.length}\n`);
  console.log("=== PLAN ===");
  console.log(`  A) MERGE (fusionar espurio → canónico): ${plan.merge.length}`);
  console.log(`  B) STRIP (solo quitar ingreso SS, registro se queda): ${plan.strip.length}`);
  console.log(`  C) DELETE (huérfano sin gemelo → eliminar): ${plan.del.length}`);
  console.log(`  ·  KEEP-REVIEW (huérfano pero cédula en la verdad → dejar y revisar): ${plan.keepReview.length}`);
  console.log(`  ·  SKIP-MULTI (varios canónicos, homónimo → se quita ingreso SS pero NO se fusiona): ${plan.skipMulti.length}`);

  console.log("\n--- muestra MERGE ---");
  for (const { s, c } of plan.merge.slice(0, 10))
    console.log(`  "${s.name}" (${s.doc ?? "s/c"}) → "${c.name}" (${c.doc ?? "s/c"})`);
  if (plan.del.length) {
    console.log("\n--- DELETE (huérfanos) ---");
    for (const { s } of plan.del) console.log(`  "${s.name}" (${s.doc ?? "s/c"})`);
  }
  if (plan.keepReview.length) {
    console.log("\n--- KEEP-REVIEW (cédula en verdad) ---");
    for (const { s } of plan.keepReview) console.log(`  "${s.name}" (${s.doc})`);
  }
  if (plan.skipMulti.length) {
    console.log("\n--- SKIP-MULTI ---");
    for (const { s, n } of plan.skipMulti) console.log(`  "${s.name}" (${s.doc ?? "s/c"}) · ${n} canónicos`);
  }

  if (!apply) {
    console.log("\nDRY-RUN: nada escrito. Repetí con --apply.");
  } else {
    let merged = 0, collapsed = 0, stripped = 0, deleted = 0;
    for (const { s, c } of plan.merge) {
      const r = await sql.begin((tx) => mergePair(tx, s.id, c.id, SS_ID));
      merged++; collapsed += r.removed;
    }
    for (const { s } of plan.strip) {
      await sql.begin((tx) => deleteSSAdms(tx, s.id, SS_ID));
      stripped++;
    }
    for (const { s } of [...plan.del]) {
      await sql.begin(async (tx) => {
        await deleteSSAdms(tx, s.id, SS_ID);
        await tx`DELETE FROM sensitive.contacts WHERE patient_id=${s.id}`;
        await tx`DELETE FROM public.patients WHERE id=${s.id}`;
        await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
                 VALUES ('patient_deleted','patient',${s.id}, ${tx.json({ name: s.name, via: "seguro-social-remediation" })})`;
      });
      deleted++;
    }
    for (const { s } of plan.keepReview) {
      await sql.begin((tx) => deleteSSAdms(tx, s.id, SS_ID)); // quita el ingreso SS, deja el paciente
    }
    // Homónimos: no se fusionan (ambiguo), pero su ingreso SS es igual de espurio → se quita.
    // El registro queda para dedup manual; así Seguro Social termina sin ingresos.
    let skipStripped = 0;
    for (const { s } of plan.skipMulti) {
      await sql.begin((tx) => deleteSSAdms(tx, s.id, SS_ID));
      skipStripped++;
    }
    // Punto 4: desactivar el hospital espurio.
    await sql`UPDATE public.hospitals SET active=false WHERE id=${SS_ID}`;

    console.log(`\n✅ MERGE ${merged} (ingresos duplicados colapsados: ${collapsed}) · STRIP ${stripped} · DELETE ${deleted} · KEEP-REVIEW ${plan.keepReview.length} · SKIP-MULTI stripped ${skipStripped}`);
  }

  // Estado final del hospital SS (siempre, para el resumen del punto 4).
  const [{ adms }] = await sql`SELECT count(*)::int AS adms FROM public.admissions WHERE hospital_id=${SS_ID}`;
  const [{ pts }] = await sql`
    SELECT count(DISTINCT p.id)::int AS pts FROM public.patients p
    JOIN public.admissions a ON a.patient_id=p.id WHERE a.hospital_id=${SS_ID}`;
  const [hospNow] = await sql`SELECT active FROM public.hospitals WHERE id=${SS_ID}`;
  console.log("\n=== PUNTO 4 — estado de 'Seguro Social La Guaira' ===");
  console.log(`  active: ${hospNow.active}`);
  console.log(`  ingresos que aún lo referencian: ${adms}`);
  console.log(`  pacientes con ingreso ahí: ${pts}`);
} catch (e) {
  console.error("💥", e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
