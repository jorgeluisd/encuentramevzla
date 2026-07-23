-- 0020 — Modelo de procedencia (ADR-0009 F0). ADITIVO: solo crea tablas vacías, no toca datos.
--
-- Cierra el hueco de ADR-0008: hoy un `patient` no sabe de dónde salió. A partir de acá, cada
-- registro importado/enriquecido queda ligado a un LOTE (`ingest_batch`) → trazable y reversible
-- por lote ("deshacer el import del consolidado-2026-07-23" = un DELETE acotado por batch).

CREATE TABLE IF NOT EXISTS public.ingest_batch (
  id               uuid PRIMARY KEY,
  kind             text NOT NULL,               -- 'reconciliation_import' | 'reconciliation_enrich' | ...
  source_file_name text,
  source_file_hash text,                        -- SHA-256 del archivo origen
  run_id           uuid,                        -- corrida de reconciliation que lo originó
  actor_id         uuid,                        -- quién lo ejecutó (team_members.id) o NULL = sistema
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Un paciente puede tener varias procedencias (creado por un lote, enriquecido por otro).
CREATE TABLE IF NOT EXISTS public.patient_provenance (
  id              uuid PRIMARY KEY,
  patient_id      uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  ingest_batch_id uuid NOT NULL REFERENCES public.ingest_batch (id) ON DELETE CASCADE,
  source_kind     text NOT NULL,                -- 'import' | 'enrich'
  source_ref      text,                         -- p.ej. sheet:row del Excel, o staging_record_id
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, ingest_batch_id, source_kind)
);
CREATE INDEX IF NOT EXISTS idx_provenance_batch ON public.patient_provenance (ingest_batch_id);
CREATE INDEX IF NOT EXISTS idx_provenance_patient ON public.patient_provenance (patient_id);

-- Misma política de seguridad que el resto (0002): nada para anon/authenticated; RLS FORCE default-deny.
REVOKE ALL ON public.ingest_batch FROM anon, authenticated;
REVOKE ALL ON public.patient_provenance FROM anon, authenticated;
ALTER TABLE public.ingest_batch        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_batch        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.patient_provenance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_provenance  FORCE  ROW LEVEL SECURITY;
