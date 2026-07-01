// A — Encolar duplicados YA EXISTENTES a la cola de revisión (spec 0020 §6, ADR-0007).
// Los duplicados anteriores al motor no tienen flags dedup_*, así que no aparecen en
// /admin/review. Este script inserta esos flags para que un humano los resuelva (0009/0010):
//   · Misma cédula válida + nombres distintos → dedup_document_conflict.
//   · Mismo nombre + mismo hospital sin cédula  → dedup_pending_review.
// En cada grupo se DEJA sin marcar al más antiguo (ancla/candidato); se marcan los demás.
// Idempotente: no re-marca lo ya marcado ni lo ya resuelto.
//
// DRY-RUN por defecto; --apply escribe. Ensayar en dump antes de prod (ADR-0007).
// Uso: DATABASE_URL=<url> node packages/db/scripts/enqueue-existing-dups.mjs [--apply]
import postgres from "postgres";
import { banner, connectionFromEnv, parseFlags } from "./_dedup-lib.mjs";

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

// No re-marcar un paciente ya flagged (dedup_*) o ya resuelto.
const NOT_FLAGGED = (idCol) => sql`NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.entity_id = ${idCol}
    AND al.action IN ('dedup_document_conflict', 'dedup_pending_review', 'review_resolved')
)`;

// (1) Conflictos de cédula: mismo doc válido, >1 nombre distinto; marca todos menos el más antiguo.
// La variedad de nombres se agrega aparte (Postgres no soporta DISTINCT en ventana).
const conflictRows = sql`
  WITH stats AS (
    SELECT normalized_doc_number AS doc
    FROM public.patients
    WHERE normalized_doc_number IS NOT NULL
      AND length(regexp_replace(normalized_doc_number, '[^0-9]', '', 'g')) >= 6
    GROUP BY normalized_doc_number
    HAVING count(*) > 1 AND count(DISTINCT normalized_name) > 1
  ),
  ranked AS (
    SELECT p.id, p.normalized_doc_number AS doc,
           row_number() OVER (PARTITION BY p.normalized_doc_number ORDER BY p.created_at ASC, p.id ASC) AS rn
    FROM public.patients p
    JOIN stats s ON s.doc = p.normalized_doc_number
  )
  SELECT id, doc FROM ranked r
  WHERE r.rn > 1 AND ${NOT_FLAGGED(sql`r.id`)}
`;

// (2) Zona gris: mismo nombre + mismo hospital sin cédula válida; marca todos menos el más antiguo.
const greyRows = sql`
  WITH pn AS (
    SELECT DISTINCT p.id, p.normalized_name AS name, a.hospital_id AS hospital, p.created_at
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    WHERE p.normalized_doc_number IS NULL
       OR length(regexp_replace(p.normalized_doc_number, '[^0-9]', '', 'g')) < 6
  ),
  ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY name, hospital ORDER BY created_at ASC, id ASC) AS rn,
           count(*) OVER (PARTITION BY name, hospital) AS grp
    FROM pn
  )
  SELECT DISTINCT id FROM ranked r
  WHERE r.grp > 1 AND r.rn > 1 AND ${NOT_FLAGGED(sql`r.id`)}
`;

try {
  banner("A — Encolar duplicados existentes a revisión", { apply, isLocal });

  const conflicts = await conflictRows;
  const grey = await greyRows;
  console.log(`Conflictos de cédula a encolar (dedup_document_conflict): ${conflicts.length}`);
  console.log(`Zona gris a encolar (dedup_pending_review): ${grey.length}`);

  if (apply) {
    await sql.begin(async (tx) => {
      for (const r of conflicts) {
        await tx`
          INSERT INTO public.audit_log (action, entity, entity_id, payload)
          VALUES ('dedup_document_conflict', 'patient', ${r.id},
                  ${tx.json({ document: r.doc, via: "remediation" })})
        `;
      }
      for (const r of grey) {
        await tx`
          INSERT INTO public.audit_log (action, entity, entity_id, payload)
          VALUES ('dedup_pending_review', 'patient', ${r.id}, ${tx.json({ via: "remediation" })})
        `;
      }
    });
    console.log(`\n✅ Encolados ${conflicts.length + grey.length} casos en /admin/review.`);
  } else {
    console.log("\nDRY-RUN: nada escrito. Repetí con --apply (tras ensayo en dump).");
  }
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
