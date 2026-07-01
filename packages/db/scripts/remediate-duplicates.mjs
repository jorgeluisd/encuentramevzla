// T17 — Fusión escalonada de PACIENTES duplicados (spec 0020 §6, ADR-0007).
// Reusa los pasos de la fusión de 0010: re-apunta admissions + sensitive.contacts, reconcilia
// (completa/eleva, nunca pisa), borra el source y audita patients_merged (reversible por audit).
//
// Tiers por CONFIANZA (conservador):
//   · Tier 1 (por defecto): misma cédula válida + nombre normalizado IDÉNTICO → misma persona.
//   · Tier 2 (--with-phone): mismo hospital + mismo teléfono (últimos 7) + nombre IDÉNTICO.
//   Lo demás (conflictos de cédula, nombres solo-parecidos, homónimos) NO se toca → cola/manual.
//
// DRY-RUN por defecto; --apply escribe. Ensayar en dump antes de prod (ADR-0007).
// Uso: DATABASE_URL=<url> node packages/db/scripts/remediate-duplicates.mjs [--apply] [--with-phone]
import postgres from "postgres";
import { banner, connectionFromEnv, isValidDoc, parseFlags } from "./_dedup-lib.mjs";

const { apply, withPhone } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

// Fusiona un grupo (ids de la MISMA persona): sobrevive el más antiguo; el resto se funde.
async function mergeGroup(tx, ids) {
  const pts = await tx`
    SELECT id, normalized_doc_number AS doc, is_minor, status, age
    FROM public.patients WHERE id = ANY(${ids}::uuid[])
    ORDER BY created_at ASC, id ASC
  `;
  if (pts.length < 2) return 0; // alguno ya se fusionó en un grupo previo
  const survivor = pts[0];
  const sources = pts.slice(1);

  // Reconciliación (solo completar/eleva): espejo de mergedFields (spec 0010/0020).
  const anyMinor = pts.some((p) => p.is_minor);
  const anyDeceased = pts.some((p) => p.status === "deceased");
  const age = survivor.age ?? pts.map((p) => p.age).find((a) => a != null) ?? null;
  const doc = isValidDoc(survivor.doc)
    ? survivor.doc
    : (pts.map((p) => p.doc).find((d) => isValidDoc(d)) ?? survivor.doc);

  for (const s of sources) {
    await tx`UPDATE public.admissions SET patient_id = ${survivor.id} WHERE patient_id = ${s.id}`;
    await tx`UPDATE sensitive.contacts SET patient_id = ${survivor.id} WHERE patient_id = ${s.id}`;
    await tx`DELETE FROM public.patients WHERE id = ${s.id}`;
    await tx`
      INSERT INTO public.audit_log (action, entity, entity_id, payload)
      VALUES ('patients_merged', 'patient', ${survivor.id}, ${tx.json({ mergedFrom: s.id, via: "remediation" })})
    `;
  }
  await tx`
    UPDATE public.patients
    SET is_minor = ${anyMinor},
        status = ${anyDeceased ? "deceased" : survivor.status}::public.person_status,
        age = ${age},
        normalized_doc_number = ${doc}
    WHERE id = ${survivor.id}
  `;
  return sources.length;
}

async function runTier(label, groups) {
  console.log(`\n${label}: ${groups.length} grupos`);
  let merged = 0;
  for (const g of groups) {
    console.log(`    "${g.name}" ×${g.ids.length}`);
    if (apply) merged += await sql.begin((tx) => mergeGroup(tx, g.ids));
  }
  if (apply) console.log(`    ✅ ${merged} registros fusionados en ${label}.`);
  return merged;
}

try {
  banner("T17 — Fusión escalonada de duplicados", { apply, isLocal });

  // Tier 1: misma cédula válida + nombre idéntico.
  const tier1 = await sql`
    SELECT array_agg(id) AS ids, normalized_name AS name
    FROM public.patients
    WHERE normalized_doc_number IS NOT NULL
      AND length(regexp_replace(normalized_doc_number, '[^0-9]', '', 'g')) >= 6
    GROUP BY normalized_doc_number, normalized_name
    HAVING count(*) > 1
  `;
  await runTier("Tier 1 (misma cédula + mismo nombre)", tier1);

  // Tier 2 (opcional): mismo hospital + mismo teléfono (últimos 7) + nombre idéntico.
  if (withPhone) {
    const tier2 = await sql`
      SELECT array_agg(DISTINCT p.id) AS ids, p.normalized_name AS name
      FROM public.patients p
      JOIN public.admissions a ON a.patient_id = p.id
      JOIN sensitive.contacts c ON c.patient_id = p.id
      WHERE c.phone IS NOT NULL
        AND length(regexp_replace(c.phone, '[^0-9]', '', 'g')) >= 7
      GROUP BY p.normalized_name, a.hospital_id, right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 7)
      HAVING count(DISTINCT p.id) > 1
    `;
    await runTier("Tier 2 (mismo hospital + teléfono + nombre)", tier2);
  } else {
    console.log("\nTier 2 (teléfono): omitido. Activá con --with-phone.");
  }

  console.log(apply ? "\nHecho." : "\nDRY-RUN: nada escrito. Repetí con --apply (tras ensayo en dump).");
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
