-- ============================================================================
-- 0018_solidarity_rate_limit_and_trgm.sql — Endurecimiento del directorio (spec 0023).
--
-- 1) Límite de tasa por IP hasheada para las escrituras públicas (alta y reporte):
--    tabla append-only que guarda SOLO el hash de la IP (nunca la IP en claro),
--    consultada por las Server Actions (service_role) antes de escribir.
-- 2) Índices trigram para que la búsqueda por texto del directorio use índice
--    (evita scans de tabla en el RPC `list_solidarity_services` → menos CPU de DB).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.action_rate_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_hash text NOT NULL,
  action      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_rate_log_lookup_idx
  ON public.action_rate_log (client_hash, action, created_at);

ALTER TABLE public.action_rate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_rate_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.action_rate_log FROM anon, authenticated;

-- --- Índices trigram para el buscador del directorio (ILIKE index-backed) ---
-- pg_trgm ya está instalado (lo usa search_patient); el opclass vive en `public`.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS solidarity_services_title_trgm
  ON public.solidarity_services USING gin (title public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS solidarity_services_description_trgm
  ON public.solidarity_services USING gin (description public.gin_trgm_ops);
