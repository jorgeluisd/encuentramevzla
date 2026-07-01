// A — Reconciliar la cola usando el Excel grande como FUENTE DE VERDAD (spec 0020 §6, ADR-0007).
// Verdad = hoja maestra del Excel 28JUN (cédula → nombre canónico; nombre → nº de personas).
//
// (1) Conflictos de cédula: si la verdad dice "cédula D = nombre A" (único) y A coincide con un
//     registro de prod → ese es el dueño. Los otros con esa cédula:
//       · nombre a distancia Levenshtein ≤ 2 de A → typo → se FUSIONAN en el dueño.
//       · nombre lejano → otra persona con cédula mal tipeada → se le LIMPIA la cédula.
// (2) Zona gris (mismo nombre + mismo hospital, sin cédula): si la verdad tiene ese nombre UNA
//     sola vez → misma persona → se FUSIONAN los duplicados.
//
// DRY-RUN por defecto (solo reporta); --apply ejecuta. Reversible por audit_log.
// Uso: DATABASE_URL=<url> node packages/db/scripts/reconcile-with-truth.mjs [--apply]
import postgres from "postgres";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
// xlsx no es dependencia de @evzla/db; se resuelve desde apps/web (donde sí lo es) / raíz.
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const xlsx = require(require.resolve("xlsx", { paths: [path.join(ROOT, "apps/web"), ROOT] }));
import { banner, connectionFromEnv, isValidDoc, parseFlags } from "./_dedup-lib.mjs";

const TRUTH_FILE = "draft/data/28JUN26 01.10 Pacientes Consolidados Hospitales Venezuela.xlsx";
const TYPO_MAX = 2; // Levenshtein ≤ 2 = mismo con typo (conservador).

const DEC = /\b(fallecid[oa]s?|fallecio|murio|muert[oa]s?)\b/g;
const nName = (r) =>
  String(r ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\bmenor\b/g, " ").replace(DEC, " ").replace(/\s+/g, " ").trim();
const nDoc = (r) => String(r ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = [...Array(n + 1).keys()], curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Fusiona un grupo (misma persona): sobrevive el más antiguo. Reusa los pasos de 0010.
async function mergeGroup(tx, ids) {
  const pts = await tx`
    SELECT id, normalized_doc_number AS doc, is_minor, status, age
    FROM public.patients WHERE id = ANY(${ids}::uuid[]) ORDER BY created_at ASC, id ASC`;
  if (pts.length < 2) return 0;
  const survivor = pts[0], sources = pts.slice(1);
  const anyMinor = pts.some((p) => p.is_minor);
  const anyDeceased = pts.some((p) => p.status === "deceased");
  const age = survivor.age ?? pts.map((p) => p.age).find((a) => a != null) ?? null;
  const doc = isValidDoc(survivor.doc) ? survivor.doc : (pts.map((p) => p.doc).find((d) => isValidDoc(d)) ?? survivor.doc);
  for (const s of sources) {
    await tx`UPDATE public.admissions SET patient_id = ${survivor.id} WHERE patient_id = ${s.id}`;
    await tx`UPDATE sensitive.contacts SET patient_id = ${survivor.id} WHERE patient_id = ${s.id}`;
    await tx`DELETE FROM public.patients WHERE id = ${s.id}`;
    await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
             VALUES ('patients_merged','patient',${survivor.id}, ${tx.json({ mergedFrom: s.id, via: "truth" })})`;
  }
  await tx`UPDATE public.patients SET is_minor=${anyMinor}, status=${anyDeceased ? "deceased" : survivor.status}::public.person_status, age=${age}, normalized_doc_number=${doc} WHERE id=${survivor.id}`;
  return sources.length;
}

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

try {
  banner(`A — Reconciliar con la verdad (Levenshtein ≤ ${TYPO_MAX})`, { apply, isLocal });

  // Cargar verdad. El Excel NO se versiona (draft/ gitignoreado); debe existir localmente.
  if (!fs.existsSync(TRUTH_FILE)) {
    console.error(`⛔ No existe el Excel de verdad: ${TRUTH_FILE}`);
    process.exit(1);
  }
  const wb = xlsx.read(fs.readFileSync(TRUTH_FILE), { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["🔍 BUSCAR PACIENTES"], { header: 1, blankrows: false });
  const hi = rows.findIndex((r) => (r || []).some((c) => /apellidos y nombres/i.test(String(c))));
  const H = (rows[hi] || []).map((c) => String(c).trim().toUpperCase());
  const cName = H.findIndex((h) => h.includes("APELLIDOS"));
  const cDoc = H.findIndex((h) => h.includes("CÉDULA") || h.includes("CEDULA"));
  const docToNames = new Map();
  const nameCount = new Map();
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nm = nName(r[cName]); if (!nm) continue;
    nameCount.set(nm, (nameCount.get(nm) ?? 0) + 1);
    const d = nDoc(r[cDoc]);
    if (isValidDoc(d)) { let s = docToNames.get(d); if (!s) { s = new Set(); docToNames.set(d, s); } s.add(nm); }
  }

  // (1) Conflictos de cédula en prod.
  const conflicts = await sql`
    SELECT normalized_doc_number AS doc, json_agg(json_build_object('id', id, 'name', normalized_name)) AS recs
    FROM public.patients
    WHERE normalized_doc_number IS NOT NULL AND length(regexp_replace(normalized_doc_number,'[^0-9]','','g')) >= 6
    GROUP BY normalized_doc_number HAVING count(DISTINCT normalized_name) > 1`;

  let adjGroups = 0, mergeIds = [], clearIds = [], resolvedIds = [], noTruth = 0, truthNoMatch = 0, truthMulti = 0;
  for (const g of conflicts) {
    const truth = docToNames.get(g.doc);
    if (!truth) { noTruth++; continue; }
    if (truth.size !== 1) { truthMulti++; continue; }
    const tName = [...truth][0];
    const owners = g.recs.filter((r) => r.name === tName);
    if (owners.length === 0) { truthNoMatch++; continue; }
    adjGroups++;
    resolvedIds.push(...g.recs.map((r) => r.id)); // todos los del grupo salen de la cola
    const ownerId = owners[0].id;
    for (const r of owners.slice(1)) mergeIds.push([ownerId, r.id]); // dups exactos del dueño
    for (const r of g.recs.filter((r) => r.name !== tName)) {
      if (lev(r.name, tName) <= TYPO_MAX) mergeIds.push([ownerId, r.id]); // typo
      else clearIds.push(r.id); // otra persona, cédula mal tipeada
    }
  }

  // (2) Zona gris resoluble por la verdad (nombre único en la verdad).
  const grey = await sql`
    SELECT p.normalized_name AS name, a.hospital_id AS hid, array_agg(DISTINCT p.id) AS ids
    FROM public.patients p JOIN public.admissions a ON a.patient_id = p.id
    WHERE p.normalized_doc_number IS NULL OR length(regexp_replace(p.normalized_doc_number,'[^0-9]','','g')) < 6
    GROUP BY p.normalized_name, a.hospital_id HAVING count(DISTINCT p.id) > 1`;
  let greyGroups = 0, greyMergeRecs = 0; const greyIdSets = [];
  for (const g of grey) {
    if (nameCount.get(g.name) === 1) {
      greyGroups++; greyMergeRecs += g.ids.length - 1; greyIdSets.push(g.ids);
      resolvedIds.push(...g.ids);
    }
  }

  console.log("=== (1) CONFLICTOS DE CÉDULA ===");
  console.log(`  conflictos totales: ${conflicts.length}`);
  console.log(`  adjudicables por la verdad (cédula→1 nombre que coincide): ${adjGroups}`);
  console.log(`    · fusiones por typo/duplicado exacto (Lev ≤ ${TYPO_MAX}): ${mergeIds.length} registros`);
  console.log(`    · cédulas a limpiar (otra persona, cédula errónea): ${clearIds.length} registros`);
  console.log(`  no adjudicables: sin cédula en la verdad=${noTruth}, verdad con varios nombres=${truthMulti}, verdad no coincide=${truthNoMatch}`);
  console.log("\n=== (2) ZONA GRIS (mismo nombre+hospital) ===");
  console.log(`  grupos resolubles por la verdad (nombre único): ${greyGroups} → ${greyMergeRecs} registros a fusionar`);
  const uniqResolved = [...new Set(resolvedIds)];
  console.log("\n=== TOTAL ===");
  console.log(`  registros que se ELIMINARÍAN por fusión: ${mergeIds.length + greyMergeRecs}`);
  console.log(`  registros con cédula LIMPIADA: ${clearIds.length}`);
  console.log(`  casos que se marcarían review_resolved (salen de la cola): ${uniqResolved.length}`);

  if (!apply) {
    console.log("\nDRY-RUN: nada escrito. Repetí con --apply.");
  } else {
    let merged = 0;
    for (const [owner, src] of mergeIds) merged += await sql.begin((tx) => mergeGroup(tx, [owner, src]));
    for (const ids of greyIdSets) merged += await sql.begin((tx) => mergeGroup(tx, ids));
    let cleared = 0;
    if (clearIds.length > 0) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
                 SELECT 'cedula_cleared','patient',id, jsonb_build_object('doc', normalized_doc_number, 'via','truth')
                 FROM public.patients WHERE id = ANY(${clearIds}::uuid[])`;
        await tx`UPDATE public.patients SET normalized_doc_number = NULL WHERE id = ANY(${clearIds}::uuid[])`;
      });
      cleared = clearIds.length;
    }
    // Cerrar en la cola: review_resolved para los casos adjudicados que aún existen y no estén resueltos.
    let resolved = 0;
    if (uniqResolved.length > 0) {
      const [{ n }] = await sql.begin(async (tx) => {
        return tx`
          INSERT INTO public.audit_log (action, entity, entity_id, payload)
          SELECT 'review_resolved','patient',p.id, jsonb_build_object('decision','resolved','via','truth')
          FROM public.patients p
          WHERE p.id = ANY(${uniqResolved}::uuid[])
            AND NOT EXISTS (SELECT 1 FROM public.audit_log r WHERE r.action='review_resolved' AND r.entity_id=p.id)
          RETURNING 1 AS n`;
      }).then((rows) => [{ n: rows.length }]);
      resolved = n;
    }
    console.log(`\n✅ Fusionados ${merged} · cédulas limpiadas ${cleared} · marcados resueltos ${resolved}.`);
  }
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
