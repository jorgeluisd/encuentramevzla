-- ============================================================================
-- 0009_performance_indexes.sql — Índices de rendimiento (aditivos, no cambian resultados).
--
-- Postgres NO crea índice para la columna que REFERENCIA una FK (solo para la PK
-- referenciada), así que los JOIN de admissions iban sin índice. También faltaba
-- índice para la igualdad por cédula y para el filtro hospitals.active del RPC.
-- Todo IF NOT EXISTS => idempotente. CREATE INDEX (no CONCURRENTLY) porque las
-- tablas son pequeñas y el script de aplicación corre en una transacción.
-- ============================================================================

-- Igualdad exacta por cédula normalizada (rama doc del buscador y del dedup).
CREATE INDEX IF NOT EXISTS idx_patients_normalized_doc_number
  ON public.patients (normalized_doc_number)
  WHERE normalized_doc_number IS NOT NULL;

-- JOINs del RPC search_patient: admissions.patient_id / hospital_id.
CREATE INDEX IF NOT EXISTS idx_admissions_patient_id
  ON public.admissions (patient_id);

CREATE INDEX IF NOT EXISTS idx_admissions_hospital_id
  ON public.admissions (hospital_id);

-- Filtro WHERE h.active = true del RPC (parcial: solo hospitales activos).
CREATE INDEX IF NOT EXISTS idx_hospitals_active
  ON public.hospitals (active)
  WHERE active;
