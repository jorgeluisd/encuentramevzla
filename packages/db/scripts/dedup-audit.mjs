// T15 — Auditoría READ-ONLY de duplicados (spec 0020 §6 Fase 0, ADR-0007).
// NUNCA escribe. Clasifica los duplicados para planear la remediación.
// Uso: DATABASE_URL=<url> node packages/db/scripts/dedup-audit.mjs
import postgres from "postgres";
import { connectionFromEnv, normalizeHospitalName } from "./_dedup-lib.mjs";

const { url } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

// Cédula sin cédula válida: NULL o < 6 dígitos.
const NO_VALID_DOC = sql`(
  p.normalized_doc_number IS NULL
  OR length(regexp_replace(p.normalized_doc_number, '[^0-9]', '', 'g')) < 6
)`;

try {
  // 1) Misma cédula válida con >1 paciente → separar "mismo nombre" (fusión segura)
  //    de "nombre distinto" (conflicto de cédula → cola de revisión).
  const docGroups = await sql`
    SELECT p.normalized_doc_number AS doc,
           array_agg(p.id) AS ids,
           array_agg(DISTINCT p.normalized_name) AS names
    FROM public.patients p
    WHERE p.normalized_doc_number IS NOT NULL
      AND length(regexp_replace(p.normalized_doc_number, '[^0-9]', '', 'g')) >= 6
    GROUP BY p.normalized_doc_number
    HAVING count(*) > 1
  `;
  const sameDocSameName = docGroups.filter((g) => g.names.length === 1);
  const sameDocDiffName = docGroups.filter((g) => g.names.length > 1);

  // 2) Mismo nombre + MISMO hospital, sin cédula válida → posibles duplicados (cola).
  const sameNameSameHospital = await sql`
    SELECT p.normalized_name AS name, a.hospital_id, count(DISTINCT p.id) AS patients
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    WHERE ${NO_VALID_DOC}
    GROUP BY p.normalized_name, a.hospital_id
    HAVING count(DISTINCT p.id) > 1
    ORDER BY count(DISTINCT p.id) DESC
  `;

  // 3) Mismo nombre + DISTINTO hospital, sin cédula válida → homónimos vs traslados.
  const sameNameDiffHospital = await sql`
    SELECT p.normalized_name AS name,
           count(DISTINCT a.hospital_id) AS hospitals,
           count(DISTINCT p.id) AS patients
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    WHERE ${NO_VALID_DOC}
    GROUP BY p.normalized_name
    HAVING count(DISTINCT a.hospital_id) > 1
    ORDER BY count(DISTINCT a.hospital_id) DESC
  `;

  // 4) Variantes de hospital (mismo nombre normalizado) → unificar (T16).
  const hospitals = await sql`SELECT id, name FROM public.hospitals`;
  const byNorm = new Map();
  for (const h of hospitals) {
    const key = normalizeHospitalName(h.name);
    if (!key) continue;
    let list = byNorm.get(key);
    if (!list) {
      list = [];
      byNorm.set(key, list);
    }
    list.push(h);
  }
  const hospitalVariants = [...byNorm.entries()].filter(([, hs]) => hs.length > 1);

  const sum = (rows, f) => rows.reduce((a, r) => a + Number(f(r)), 0);

  console.log("=== AUDITORÍA DE DUPLICADOS (read-only) ===\n");
  console.log("(1) Misma cédula válida:");
  console.log(`    · fusión SEGURA (mismo nombre): ${sameDocSameName.length} grupos, ${sum(sameDocSameName, (g) => g.ids.length)} registros`);
  console.log(`    · conflicto de cédula (nombre distinto → cola): ${sameDocDiffName.length} grupos`);
  for (const g of sameDocDiffName.slice(0, 5)) console.log(`        doc ${g.doc}: ${g.names.join(" / ")}`);

  console.log(`\n(2) Mismo nombre + MISMO hospital sin cédula → cola de revisión: ${sameNameSameHospital.length} grupos`);
  for (const g of sameNameSameHospital.slice(0, 8)) console.log(`        "${g.name}" ×${g.patients}`);

  console.log(`\n(3) Mismo nombre + DISTINTO hospital sin cédula → homónimos/traslados: ${sameNameDiffHospital.length} nombres`);
  for (const g of sameNameDiffHospital.slice(0, 8)) console.log(`        "${g.name}" en ${g.hospitals} hospitales (${g.patients} registros)`);

  console.log(`\n(4) Variantes de hospital (mismo nombre normalizado): ${hospitalVariants.length} grupos`);
  for (const [key, hs] of hospitalVariants.slice(0, 10)) console.log(`        [${key}] ← ${hs.map((h) => h.name).join(" | ")}`);

  console.log("\nPlan sugerido: T16 unifica (4); T17 auto-fusiona (1 mismo nombre); (2) y conflictos de (1) → cola; (3) se mantiene separado.");
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
