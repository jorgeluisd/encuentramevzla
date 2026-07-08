-- ============================================================================
-- 0017_solidarity_services_report.sql — Reporte público de una publicación (spec 0023).
--
-- Un visitante puede REPORTAR una publicación aprobada (spam, falsa, abusiva). El
-- reporte es un FLAG idempotente (booleano): no baja la publicación del directorio
-- (para no permitir "tumbar" ofertas legítimas con un solo reporte), pero la hace
-- aparecer PRIMERO en la cola de revisión del panel /admin, con etiqueta "Reportado",
-- para que un moderador decida. La escritura la hace `service_role` desde una Server
-- Action protegida por Turnstile (anti-bot). El RPC público de listado NO cambia:
-- una publicación reportada sigue visible hasta que un moderador actúe.
-- ============================================================================

ALTER TABLE public.solidarity_services
  ADD COLUMN IF NOT EXISTS reported       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reported_at    timestamptz,
  ADD COLUMN IF NOT EXISTS report_reason  text;  -- motivo breve del último reporte

-- Para ordenar la cola de revisión con las reportadas primero.
CREATE INDEX IF NOT EXISTS solidarity_services_reported_idx
  ON public.solidarity_services (reported, reported_at DESC);
