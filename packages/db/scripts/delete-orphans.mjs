// Limpieza de pacientes HUÉRFANOS (sin admisión = sin hospital → invisibles en el buscador).
// Borra SOLO los que NO tienen cédula válida (sin hospital y sin cédula no hay con qué
// identificarlos ni compararlos). Los huérfanos CON cédula se conservan (medibles por cédula).
// Reversible: el dato crudo queda en raw_rows y se audita orphan_deleted con el nombre.
// DRY-RUN por defecto; --apply borra. Uso: DATABASE_URL=<url> node packages/db/scripts/delete-orphans.mjs [--apply]
import postgres from "postgres";
import { banner, connectionFromEnv, parseFlags } from "./_dedup-lib.mjs";

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

const ORPHAN_NO_DOC = sql`
  NOT EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id = p.id)
  AND (p.normalized_doc_number IS NULL
       OR length(regexp_replace(p.normalized_doc_number, '[^0-9]', '', 'g')) < 6)
`;

try {
  banner("Limpieza de huérfanos sin cédula", { apply, isLocal });

  const [tot] = await sql`
    SELECT count(*)::int n FROM public.patients p
    WHERE NOT EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id = p.id)
  `;
  const [withDoc] = await sql`
    SELECT count(*)::int n FROM public.patients p
    WHERE NOT EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id = p.id)
      AND p.normalized_doc_number IS NOT NULL
      AND length(regexp_replace(p.normalized_doc_number, '[^0-9]', '', 'g')) >= 6
  `;
  const targets = await sql`SELECT p.id, p.normalized_name AS name FROM public.patients p WHERE ${ORPHAN_NO_DOC}`;

  console.log(`Huérfanos totales (sin admisión): ${tot.n}`);
  console.log(`  · con cédula válida (SE CONSERVAN): ${withDoc.n}`);
  console.log(`  · sin cédula (A BORRAR): ${targets.length}`);

  if (!apply) {
    console.log("\nDRY-RUN: nada borrado. Repetí con --apply.");
  } else if (targets.length > 0) {
    const ids = targets.map((t) => t.id);
    await sql.begin(async (tx) => {
      // Traza para reversibilidad (nombre queda en audit; el crudo, en raw_rows).
      await tx`
        INSERT INTO public.audit_log (action, entity, entity_id, payload)
        SELECT 'orphan_deleted', 'patient', p.id, jsonb_build_object('name', p.normalized_name, 'via', 'orphan-cleanup')
        FROM public.patients p WHERE p.id = ANY(${ids}::uuid[])
      `;
      await tx`DELETE FROM sensitive.contacts WHERE patient_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM public.patients WHERE id = ANY(${ids}::uuid[])`;
    });
    console.log(`\n✅ Borrados ${targets.length} huérfanos sin cédula.`);
  }
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
