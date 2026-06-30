-- ============================================================================
-- 0013_team_role_hospital_admin.sql — Rol scoped por hospital (spec 0018, P0)
--
-- Añade el valor `hospital_admin` al enum `team_role` (ver 0004_team_members).
--   * uploader:       carga/edita/descarga lo suyo (acotado a su hospital).
--   * hospital_admin: lo del uploader + resuelve la cola de revisión de SU hospital
--                     + gestiona (invita) a su propio personal.
--   * moderator:      moderador global (owner = moderador global).
--
-- Sin otros cambios de esquema: los datos de voz/manual reusan
-- patients/admissions/sensitive/raw_rows. Idempotente (IF NOT EXISTS).
-- ============================================================================

ALTER TYPE public.team_role ADD VALUE IF NOT EXISTS 'hospital_admin';
