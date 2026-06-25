-- ============================================================================
-- 0001_init.sql — Extensiones, schemas y tablas (Postgres 16 / Supabase)
--
-- REQUISITO INNEGOCIABLE: separación FÍSICA público / sensible.
--   * schema `public`   -> datos NO sensibles (lo que el sistema puede mostrar de forma mediada)
--   * schema `sensible` -> PII y datos clínicos, AISLADO, sin grants al rol anónimo.
-- ============================================================================

-- --- Extensiones ---
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- similitud por trigramas (matching difuso)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- levenshtein / soundex
CREATE EXTENSION IF NOT EXISTS unaccent;      -- normalización de acentos

-- --- Schemas ---
CREATE SCHEMA IF NOT EXISTS sensible;

-- --- Enum de estado ---
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_persona') THEN
    CREATE TYPE public.estado_persona AS ENUM (
      'ingresado', 'trasladado', 'alta', 'localizado', 'fallecido'
    );
  END IF;
END$$;

-- ============================================================================
-- Tablas en `public` (no sensible)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hospitales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  telefono_mesa_info   text,                       -- único teléfono revelable por el buscador
  ciudad               text,
  activo               boolean NOT NULL DEFAULT true
);

-- Preserva el dato CRUDO de cada fila de Excel. content_hash da idempotencia.
CREATE TABLE IF NOT EXISTS public.staging_filas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_id    uuid NOT NULL,
  content_hash  text NOT NULL UNIQUE,
  fila_cruda    jsonb NOT NULL,
  hospital_id   uuid REFERENCES public.hospitales(id),
  subido_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Persona ↔ ingreso: NO se colapsa el hospital dentro de persona (eso va en `ingresos`).
CREATE TABLE IF NOT EXISTS public.personas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_normalizado       text NOT NULL,
  tokens_nombre            text[],
  edad                     integer,
  doc_tipo                 text,
  doc_numero_normalizado   text,
  estado                   public.estado_persona NOT NULL DEFAULT 'ingresado',
  es_menor                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Índice trigram para matching difuso sobre el nombre normalizado.
CREATE INDEX IF NOT EXISTS idx_personas_nombre_trgm
  ON public.personas USING gin (nombre_normalizado gin_trgm_ops);

-- Varios ingresos por persona => permite TRASLADOS sin perder histórico.
CREATE TABLE IF NOT EXISTS public.ingresos (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id                    uuid NOT NULL REFERENCES public.personas(id),
  hospital_id                   uuid NOT NULL REFERENCES public.hospitales(id),
  fecha_ingreso                 timestamptz,
  estado                        public.estado_persona NOT NULL DEFAULT 'ingresado',
  observaciones_publicas_flag   boolean NOT NULL DEFAULT false,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- Append-only. Toda mutación deja rastro (no se actualiza ni borra).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,
  accion       text NOT NULL,
  entidad      text NOT NULL,
  entidad_id   uuid,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Anti-enumeración: se guarda SOLO el hash del término buscado, nunca el texto.
CREATE TABLE IF NOT EXISTS public.busqueda_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termino_hash    text NOT NULL,
  resultado_tipo  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Tablas en `sensible` (PII / clínico — AISLADO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sensible.contacto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id   uuid NOT NULL REFERENCES public.personas(id),
  telefono     text,
  direccion    text
);

CREATE TABLE IF NOT EXISTS sensible.observaciones_clinicas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingreso_id   uuid NOT NULL REFERENCES public.ingresos(id),
  texto        text,
  llego_con    text
);
