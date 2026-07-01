// Reconciliar HUÉRFANOS con cédula (sin admisión pero con cédula válida). Regla de Jorge:
//   · si esa cédula YA está registrada en un paciente CON hospital → fusiona el huérfano ahí.
//   · si no existe la cédula con hospital → borra el huérfano (error de carga; no se admiten
//     registros sin hospital).
// Reversible por audit_log (patients_merged / orphan_deleted). DRY-RUN por defecto; --apply ejecuta.
// Uso: DATABASE_URL=<url> node packages/db/scripts/reconcile-orphans.mjs [--apply]
import postgres from "postgres";
import { banner, connectionFromEnv, isValidDoc, parseFlags } from "./_dedup-lib.mjs";

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

// Fusión DIRIGIDA: el target (con hospital) sobrevive; el source (huérfano) se funde.
async function mergeInto(tx, targetId, sourceId) {
  const [t] = await tx`SELECT normalized_doc_number doc, is_minor, status, age FROM public.patients WHERE id = ${targetId}`;
  const [s0] = await tx`SELECT normalized_doc_number doc, is_minor, status, age FROM public.patients WHERE id = ${sourceId}`;
  if (!t || !s0) return 0;
  await tx`UPDATE public.admissions SET patient_id = ${targetId} WHERE patient_id = ${sourceId}`;
  await tx`UPDATE sensitive.contacts SET patient_id = ${targetId} WHERE patient_id = ${sourceId}`;
  await tx`DELETE FROM public.patients WHERE id = ${sourceId}`;
  const isMinor = t.is_minor || s0.is_minor;
  const status = t.status === "deceased" || s0.status === "deceased" ? "deceased" : t.status;
  const age = t.age ?? s0.age;
  const doc = isValidDoc(t.doc) ? t.doc : (isValidDoc(s0.doc) ? s0.doc : t.doc);
  await tx`UPDATE public.patients SET is_minor=${isMinor}, status=${status}::public.person_status, age=${age}, normalized_doc_number=${doc} WHERE id=${targetId}`;
  await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
           VALUES ('patients_merged','patient',${targetId}, ${tx.json({ mergedFrom: sourceId, via: "orphan" })})`;
  return 1;
}

const VALID = (col) => sql`(${col} IS NOT NULL AND length(regexp_replace(${col},'[^0-9]','','g')) >= 6)`;

try {
  banner("Reconciliar huérfanos con cédula", { apply, isLocal });

  // Huérfanos (sin admisión) con cédula válida.
  const orphans = await sql`
    SELECT id, normalized_doc_number AS doc FROM public.patients p
    WHERE NOT EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id = p.id)
      AND ${VALID(sql`p.normalized_doc_number`)}`;

  // Pacientes CON hospital, por cédula (target de fusión = el más antiguo).
  const withHosp = await sql`
    SELECT p.normalized_doc_number AS doc, array_agg(p.id ORDER BY p.created_at ASC, p.id ASC) AS ids
    FROM public.patients p
    WHERE EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id = p.id)
      AND ${VALID(sql`p.normalized_doc_number`)}
    GROUP BY p.normalized_doc_number`;
  const targetByDoc = new Map(withHosp.map((r) => [r.doc, r.ids[0]]));

  const toMerge = [], toDelete = [];
  for (const o of orphans) {
    const t = targetByDoc.get(o.doc);
    if (t && t !== o.id) toMerge.push([t, o.id]);
    else toDelete.push(o.id);
  }

  console.log(`Huérfanos con cédula: ${orphans.length}`);
  console.log(`  · con esa cédula ya registrada en un hospital → FUSIONAR: ${toMerge.length}`);
  console.log(`  · sin hospital en ningún lado → BORRAR: ${toDelete.length}`);

  if (!apply) {
    console.log("\nDRY-RUN: nada escrito. Repetí con --apply.");
  } else {
    let merged = 0;
    for (const [t, s0] of toMerge) merged += await sql.begin((tx) => mergeInto(tx, t, s0));
    let deleted = 0;
    if (toDelete.length > 0) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
                 SELECT 'orphan_deleted','patient',id, jsonb_build_object('name', normalized_name, 'doc', normalized_doc_number, 'via','orphan-no-hospital')
                 FROM public.patients WHERE id = ANY(${toDelete}::uuid[])`;
        await tx`DELETE FROM sensitive.contacts WHERE patient_id = ANY(${toDelete}::uuid[])`;
        await tx`DELETE FROM public.patients WHERE id = ANY(${toDelete}::uuid[])`;
      });
      deleted = toDelete.length;
    }
    console.log(`\n✅ Fusionados ${merged} · borrados ${deleted}.`);
  }
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
