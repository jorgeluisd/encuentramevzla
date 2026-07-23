// SQL de F2 — enriquecimiento fill-only (ADR-0009). Escribe en public.patients A PROPÓSITO
// (a diferencia del diagnóstico, que es solo lectura): completa SOLO campos vacíos de los
// pacientes que ya están en prod, desde el Excel. COALESCE garantiza que NUNCA se pisa un valor.
//
// Alcance conservador: SOLO MATCH_IDENTICAL (nombre ≥ 0.92). Los MATCH_CONFLICT van a revisión (F3).

// Mejor fila de staging por paciente de prod (prefiere cédula válida y con edad).
const BEST_STAGING =
  `SELECT DISTINCT ON (m.production_record_id) ` +
  `m.production_record_id AS pid, s.normalized_doc, s.is_doc_valid, s.age, s.is_minor ` +
  `FROM reconciliation.reconciliation_match m ` +
  `JOIN reconciliation.staging_patient_record s ON s.id = m.staging_record_id ` +
  `WHERE m.run_id = $1 AND m.category = 'MATCH_IDENTICAL' ` +
  `ORDER BY m.production_record_id, s.is_doc_valid DESC, (s.age IS NOT NULL) DESC`;

// Condición: la fila cambiaría algo (rellena cédula vacía, edad vacía, o eleva a menor).
const WOULD_CHANGE =
  `((p.normalized_doc_number IS NULL AND b.is_doc_valid) ` +
  `OR (p.age IS NULL AND b.age IS NOT NULL) ` +
  `OR (b.is_minor AND NOT p.is_minor))`;

// DRY-RUN: cuántos pacientes recibirían cada relleno (solo lectura).
export const ENRICH_PREVIEW_SQL =
  `SELECT ` +
  `count(*) FILTER (WHERE p.normalized_doc_number IS NULL AND b.is_doc_valid)::int AS fill_doc, ` +
  `count(*) FILTER (WHERE p.age IS NULL AND b.age IS NOT NULL)::int AS fill_age, ` +
  `count(*) FILTER (WHERE b.is_minor AND NOT p.is_minor)::int AS elevate_minor, ` +
  `count(*) FILTER (WHERE ${WOULD_CHANGE})::int AS affected ` +
  `FROM (${BEST_STAGING}) b JOIN public.patients p ON p.id = b.pid`;

// APPLY: fill-only (COALESCE) + tagueo de procedencia (source_kind='enrich') en una sentencia.
// $1 = run_id, $2 = ingest_batch_id.
export const ENRICH_APPLY_SQL =
  `WITH best AS (${BEST_STAGING}), upd AS (` +
  `UPDATE public.patients p SET ` +
  `normalized_doc_number = COALESCE(p.normalized_doc_number, CASE WHEN b.is_doc_valid THEN b.normalized_doc END), ` +
  `age = COALESCE(p.age, b.age), ` +
  `is_minor = p.is_minor OR b.is_minor ` +
  `FROM best b WHERE p.id = b.pid AND ${WOULD_CHANGE} ` +
  `RETURNING p.id) ` +
  `INSERT INTO public.patient_provenance (id, patient_id, ingest_batch_id, source_kind, source_ref) ` +
  `SELECT gen_random_uuid(), id, $2, 'enrich', NULL FROM upd ` +
  `ON CONFLICT (patient_id, ingest_batch_id, source_kind) DO NOTHING`;
