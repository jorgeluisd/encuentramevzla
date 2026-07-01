-- ============================================================================
-- 0014_hospital_aliases.sql — Catálogo canónico de hospitales (spec 0020, ADR-0005)
--
-- Hace converger las variantes de un mismo hospital ("H. Vargas",
-- "Hospital Vargas de Caracas", "CAMPO DE GOLF CARIBE" vs "Campo de Golf Caribe")
-- a un único id canónico, para no fragmentar admisiones ni ensuciar la dedup.
--
--   * hospitals.provisional: un hospital creado al vuelo durante una ingesta (no del
--     catálogo oficial) queda provisional hasta que un moderador lo confirme o lo
--     fusione con el canónico.
--   * hospital_aliases: nombre normalizado (normalizeHospitalName) → hospital canónico.
--     `resolveByName` consulta alias → fuzzy (trigram) → si no hay match, crea provisional
--     y registra el alias para que la próxima vez sea acierto directo.
--
-- Aditivo e idempotente (IF NOT EXISTS). No expone datos sensibles.
-- ============================================================================

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS provisional boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.hospital_aliases (
  alias_normalized text PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals (id)
);

-- Búsqueda de aliases por hospital (para revisión/fusión de variantes por un moderador).
CREATE INDEX IF NOT EXISTS idx_hospital_aliases_hospital_id
  ON public.hospital_aliases (hospital_id);
