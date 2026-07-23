-- 0019 — Esquema de reconciliación (staging aislado, diagnóstico, ADR-0008).
--
-- OBJETIVO: cruzar un .xlsx consolidado contra prod SIN mutar nada preexistente.
-- Todo vive en el esquema `reconciliation`, que es EFÍMERO y se revierte por completo con:
--     DROP SCHEMA reconciliation CASCADE;
-- sin efecto alguno sobre `public` / `sensitive`.
--
-- IDEMPOTENTE: se puede reaplicar sin ensuciar. Cada corrida es un `run_id` (UUID).
-- El crudo del Excel NUNCA se pierde (columna `raw jsonb`).

-- Extensiones necesarias para el matching difuso (ya presentes desde 0001; se reafirman).
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- similitud por trigramas
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- levenshtein (desempate)
CREATE EXTENSION IF NOT EXISTS unaccent;      -- normalización de acentos

CREATE SCHEMA IF NOT EXISTS reconciliation;

-- Una corrida del pipeline. `source_file_hash` (SHA-256) da idempotencia: re-ingerir el
-- mismo archivo aborta salvo --force (control en la aplicación, no un UNIQUE, para permitir
-- reintentos deliberados).
CREATE TABLE IF NOT EXISTS reconciliation.reconciliation_run (
  run_id           uuid PRIMARY KEY,
  source_file_name text        NOT NULL,
  source_file_hash text        NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text        NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'ingested', 'reconciled', 'completed', 'failed')),
  notes            text
);
CREATE INDEX IF NOT EXISTS idx_recon_run_hash ON reconciliation.reconciliation_run (source_file_hash);

-- Una fila cruda del Excel + su normalización determinista (hecha en @evzla/core).
-- El crudo completo (incluidas las 14 columnas sensibles de "Refugio Oeste") vive en `raw`
-- y se destruye con el DROP SCHEMA; nunca se indexa ni sale al reporte.
CREATE TABLE IF NOT EXISTS reconciliation.staging_patient_record (
  id                     uuid PRIMARY KEY,
  run_id                 uuid NOT NULL REFERENCES reconciliation.reconciliation_run (run_id) ON DELETE CASCADE,
  sheet_name             text NOT NULL,
  source_row_number      integer NOT NULL,
  raw                    jsonb NOT NULL,
  -- Normalizados (deterministas, espejo del dominio):
  normalized_name        text NOT NULL,
  name_tokens            text[] NOT NULL DEFAULT '{}',
  normalized_doc         text,           -- NULL si centinela / < 6 dígitos
  is_doc_valid           boolean NOT NULL DEFAULT false,
  age                    integer,
  sex                    text,
  is_minor               boolean NOT NULL DEFAULT false, -- derivado de centinela [Menor]/INFANTE o edad
  has_uncertainty_marker boolean NOT NULL DEFAULT false, -- [?] / [ILEGIBLE] en cualquier celda
  registered_date_raw    text,           -- SIEMPRE el crudo de FECHA REG.
  registered_date        date,           -- parseo best-effort; NULL si no se pudo
  -- El nombre de la PESTAÑA es la fuente autoritativa del centro; la columna es verificación cruzada.
  center_from_sheet      text NOT NULL,
  center_from_column     text,           -- CENTRO ACTUAL (para registrar discrepancias)
  center_mismatch        boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staging_run ON reconciliation.staging_patient_record (run_id);
-- Bloqueo del matching: por centro (pestaña) y primer carácter del apellido normalizado.
CREATE INDEX IF NOT EXISTS idx_staging_block
  ON reconciliation.staging_patient_record (run_id, sheet_name, left(normalized_name, 1));
CREATE INDEX IF NOT EXISTS idx_staging_name_trgm
  ON reconciliation.staging_patient_record USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_staging_doc
  ON reconciliation.staging_patient_record (run_id, normalized_doc) WHERE normalized_doc IS NOT NULL;

-- Resultado del cruce. Una fila por veredicto.
--   ONLY_IN_SOURCE      → staging_record_id set, production_record_id NULL
--   MATCH_IDENTICAL     → ambos set
--   MATCH_CONFLICT      → ambos set + conflicting_fields
--   ONLY_IN_PRODUCTION  → staging_record_id NULL, production_record_id set (sección crítica)
--   DUP_IN_SOURCE       → staging_record_id + related_staging_record_id (duplicado intra-Excel)
CREATE TABLE IF NOT EXISTS reconciliation.reconciliation_match (
  id                         uuid PRIMARY KEY,
  run_id                     uuid NOT NULL REFERENCES reconciliation.reconciliation_run (run_id) ON DELETE CASCADE,
  staging_record_id          uuid REFERENCES reconciliation.staging_patient_record (id) ON DELETE CASCADE,
  production_record_id        uuid,   -- id de public.patients; SIN FK (no acoplar a prod; prod es solo lectura)
  related_staging_record_id  uuid REFERENCES reconciliation.staging_patient_record (id) ON DELETE CASCADE,
  category                   text NOT NULL
                               CHECK (category IN ('ONLY_IN_SOURCE','MATCH_IDENTICAL','MATCH_CONFLICT','ONLY_IN_PRODUCTION','DUP_IN_SOURCE')),
  similarity_score           numeric(4,3),
  conflicting_fields         jsonb,
  resolution_status          text NOT NULL DEFAULT 'unreviewed'
                               CHECK (resolution_status IN ('unreviewed','needs_review','accepted','rejected')),
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_run_cat ON reconciliation.reconciliation_match (run_id, category);
CREATE INDEX IF NOT EXISTS idx_match_staging ON reconciliation.reconciliation_match (staging_record_id);
CREATE INDEX IF NOT EXISTS idx_match_prod ON reconciliation.reconciliation_match (production_record_id);

-- Privacidad: el esquema jamás se expone a la API. Solo conexión directa de servidor
-- (service_role / DATABASE_URL), nunca anon/authenticated (espejo de la política de 0002 sobre `sensitive`).
REVOKE ALL ON SCHEMA reconciliation FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA reconciliation FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA reconciliation REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER TABLE reconciliation.reconciliation_run       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation.reconciliation_run       FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliation.staging_patient_record   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation.staging_patient_record   FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliation.reconciliation_match     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation.reconciliation_match     FORCE ROW LEVEL SECURITY;
