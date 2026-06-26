-- ============================================================================
-- 0001_init.sql — Extensiones, schemas y tablas (Postgres 16 / Supabase)
--
-- REQUISITO INNEGOCIABLE: separación FÍSICA público / sensible.
--   * schema `public`    -> datos NO sensibles (lo que el sistema puede mostrar de forma mediada)
--   * schema `sensitive` -> PII y datos clínicos, AISLADO, sin grants al rol anónimo.
-- ============================================================================

-- --- Extensiones ---
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- similitud por trigramas (matching difuso)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- levenshtein / soundex
CREATE EXTENSION IF NOT EXISTS unaccent;      -- normalización de acentos

-- --- Schemas ---
CREATE SCHEMA IF NOT EXISTS sensitive;

-- --- Enum de estado ---
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'person_status') THEN
    CREATE TYPE public.person_status AS ENUM (
      'admitted', 'transferred', 'discharged', 'located', 'deceased'
    );
  END IF;
END$$;

-- ============================================================================
-- Tablas en `public` (no sensible)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hospitals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  info_desk_phone text,                       -- único teléfono revelable por el buscador
  city            text,
  active          boolean NOT NULL DEFAULT true
);

-- Preserva el dato CRUDO de cada fila de Excel. content_hash da idempotencia.
CREATE TABLE IF NOT EXISTS public.raw_rows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       uuid NOT NULL,
  content_hash  text NOT NULL UNIQUE,
  raw_row       jsonb NOT NULL,
  hospital_id   uuid REFERENCES public.hospitals(id),
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Paciente ↔ ingreso: NO se colapsa el hospital dentro del paciente (eso va en `admissions`).
CREATE TABLE IF NOT EXISTS public.patients (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name        text NOT NULL,
  name_tokens            text[],
  age                    integer,
  doc_type               text,
  normalized_doc_number  text,
  status                 public.person_status NOT NULL DEFAULT 'admitted',
  is_minor               boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Índice trigram para matching difuso sobre el nombre normalizado.
CREATE INDEX IF NOT EXISTS idx_patients_normalized_name_trgm
  ON public.patients USING gin (normalized_name gin_trgm_ops);

-- Varios ingresos por paciente => permite TRASLADOS sin perder histórico.
CREATE TABLE IF NOT EXISTS public.admissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES public.patients(id),
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id),
  admitted_at       timestamptz,
  status            public.person_status NOT NULL DEFAULT 'admitted',
  has_public_notes  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Append-only. Toda mutación deja rastro (no se actualiza ni borra).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Anti-enumeración: se guarda SOLO el hash del término buscado, nunca el texto.
CREATE TABLE IF NOT EXISTS public.search_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_hash    text NOT NULL,
  result_type  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Tablas en `sensitive` (PII / clínico — AISLADO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sensitive.contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES public.patients(id),
  phone       text,
  address     text
);

CREATE TABLE IF NOT EXISTS sensitive.clinical_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id  uuid NOT NULL REFERENCES public.admissions(id),
  note          text,
  arrived_with  text
);
