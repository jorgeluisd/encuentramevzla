// SQL centralizado del pipeline de reconciliación. FUNCIONES PURAS que devuelven texto:
// así un test puede verificar que NINGUNA sentencia de escritura toca tablas fuera de
// `reconciliation` y que toda lectura de producción es SELECT (ADR-0008, restricción dura).
//
// Las escrituras se ejecutan con sql.unsafe(text, params); las lecturas también, para que
// TODA sentencia del adapter pase por aquí y quede cubierta por el guard test.

export const STAGING_COLUMNS = [
  "id",
  "run_id",
  "sheet_name",
  "source_row_number",
  "raw",
  "normalized_name",
  "name_tokens",
  "normalized_doc",
  "is_doc_valid",
  "age",
  "sex",
  "is_minor",
  "has_uncertainty_marker",
  "registered_date_raw",
  "registered_date",
  "center_from_sheet",
  "center_from_column",
  "center_mismatch",
] as const;

export const MATCH_COLUMNS = [
  "id",
  "run_id",
  "staging_record_id",
  "production_record_id",
  "related_staging_record_id",
  "category",
  "similarity_score",
  "conflicting_fields",
  "resolution_status",
] as const;

// ---------- ESCRITURAS (solo reconciliation.*) ----------

export const CREATE_RUN_SQL =
  `INSERT INTO reconciliation.reconciliation_run (run_id, source_file_name, source_file_hash) ` +
  `VALUES ($1, $2, $3)`;

export const MARK_STATUS_SQL =
  `UPDATE reconciliation.reconciliation_run ` +
  `SET status = $2, finished_at = CASE WHEN $2 IN ('completed', 'failed') THEN now() ELSE finished_at END ` +
  `WHERE run_id = $1`;

export function insertStagingSql(rowCount: number): string {
  return (
    `INSERT INTO reconciliation.staging_patient_record (${STAGING_COLUMNS.join(", ")}) VALUES ` +
    placeholders(rowCount, STAGING_COLUMNS.length)
  );
}

export function insertMatchSql(rowCount: number): string {
  return (
    `INSERT INTO reconciliation.reconciliation_match (${MATCH_COLUMNS.join(", ")}) VALUES ` +
    placeholders(rowCount, MATCH_COLUMNS.length)
  );
}

// ---------- LECTURAS (SELECT: reconciliation y/o producción read-only) ----------

export const FIND_RUN_BY_HASH_SQL =
  `SELECT run_id, source_file_name, source_file_hash ` +
  `FROM reconciliation.reconciliation_run WHERE source_file_hash = $1 ORDER BY started_at DESC LIMIT 1`;

export const LOAD_STAGING_FOR_RUN_SQL =
  `SELECT id, sheet_name, normalized_name, normalized_doc, age, sex ` +
  `FROM reconciliation.staging_patient_record WHERE run_id = $1`;

// Un candidato por (paciente, hospital): un paciente cuenta en el bloque de cada centro
// donde tiene ingreso. Producción es SOLO lectura (SELECT). `patients` no tiene sexo.
export const LOAD_PRODUCTION_CANDIDATES_SQL =
  `SELECT p.id, p.normalized_name, p.normalized_doc_number, p.age, h.id AS hospital_id, h.name AS hospital_name ` +
  `FROM public.patients p ` +
  `JOIN public.admissions a ON a.patient_id = p.id ` +
  `JOIN public.hospitals h ON h.id = a.hospital_id ` +
  `WHERE h.active = true AND h.test = false`;

// Un registro por paciente (hospital primario = ingreso más reciente) para ONLY_IN_PRODUCTION.
export const LIST_ALL_PRODUCTION_SQL =
  `SELECT DISTINCT ON (p.id) p.id, p.normalized_name, h.id AS hospital_id, h.name AS hospital_name, p.created_at ` +
  `FROM public.patients p ` +
  `JOIN public.admissions a ON a.patient_id = p.id ` +
  `JOIN public.hospitals h ON h.id = a.hospital_id ` +
  `WHERE h.active = true AND h.test = false ` +
  `ORDER BY p.id, a.created_at DESC`;

// Catálogo de hospitales + alias (para mapear pestaña → centro canónico, ADR-0005). SELECT.
export const LOAD_HOSPITAL_CATALOG_SQL =
  `SELECT h.id, h.name FROM public.hospitals h WHERE h.active = true AND h.test = false`;

export const LOAD_HOSPITAL_ALIASES_SQL =
  `SELECT alias_normalized, hospital_id FROM public.hospital_aliases`;

// ---------- LECTURAS para el reporte (SELECT sobre reconciliation) ----------

export const REPORT_MATCHES_SQL =
  `SELECT m.category, m.similarity_score, m.resolution_status, m.production_record_id, ` +
  `m.staging_record_id, m.related_staging_record_id, m.conflicting_fields, ` +
  `s.center_from_sheet, s.normalized_name AS staging_name, s2.normalized_name AS related_name ` +
  `FROM reconciliation.reconciliation_match m ` +
  `LEFT JOIN reconciliation.staging_patient_record s ON s.id = m.staging_record_id ` +
  `LEFT JOIN reconciliation.staging_patient_record s2 ON s2.id = m.related_staging_record_id ` +
  `WHERE m.run_id = $1`;

export const REPORT_STAGING_COUNT_SQL =
  `SELECT count(*)::int AS n FROM reconciliation.staging_patient_record WHERE run_id = $1`;

export const REPORT_STAGING_CENTERS_SQL =
  `SELECT DISTINCT center_from_sheet FROM reconciliation.staging_patient_record WHERE run_id = $1`;

export const REPORT_RUN_META_SQL =
  `SELECT run_id, source_file_name, source_file_hash FROM reconciliation.reconciliation_run WHERE run_id = $1`;

// Info de prod para los ids referenciados por el reporte (nombres, hospital, fecha). SELECT read-only.
export const REPORT_PRODUCTION_INFO_SQL =
  `SELECT DISTINCT ON (p.id) p.id, p.normalized_name, h.id AS hospital_id, h.name AS hospital_name, p.created_at ` +
  `FROM public.patients p ` +
  `JOIN public.admissions a ON a.patient_id = p.id ` +
  `JOIN public.hospitals h ON h.id = a.hospital_id ` +
  `WHERE p.id = ANY($1::uuid[]) ORDER BY p.id, a.created_at DESC`;

export const REPORT_PRODUCTION_COUNT_SQL =
  `SELECT count(DISTINCT p.id)::int AS n ` +
  `FROM public.patients p ` +
  `JOIN public.admissions a ON a.patient_id = p.id ` +
  `JOIN public.hospitals h ON h.id = a.hospital_id ` +
  `WHERE h.active = true AND h.test = false`;

// Manifiesto para el guard test: toda escritura y toda lectura que el adapter puede emitir.
export function allStatements(): { writes: string[]; reads: string[] } {
  return {
    writes: [CREATE_RUN_SQL, MARK_STATUS_SQL, insertStagingSql(2), insertMatchSql(2)],
    reads: [
      FIND_RUN_BY_HASH_SQL,
      LOAD_STAGING_FOR_RUN_SQL,
      LOAD_PRODUCTION_CANDIDATES_SQL,
      LIST_ALL_PRODUCTION_SQL,
      LOAD_HOSPITAL_CATALOG_SQL,
      LOAD_HOSPITAL_ALIASES_SQL,
      REPORT_MATCHES_SQL,
      REPORT_STAGING_COUNT_SQL,
      REPORT_STAGING_CENTERS_SQL,
      REPORT_RUN_META_SQL,
      REPORT_PRODUCTION_INFO_SQL,
      REPORT_PRODUCTION_COUNT_SQL,
    ],
  };
}

function placeholders(rowCount: number, colCount: number): string {
  const rows: string[] = [];
  let p = 0;
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < colCount; c++) cols.push(`$${++p}`);
    rows.push(`(${cols.join(", ")})`);
  }
  return rows.join(", ");
}
