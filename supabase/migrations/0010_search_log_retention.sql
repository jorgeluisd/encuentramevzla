-- ============================================================================
-- 0010_search_log_retention.sql — Retención de search_log (higiene/coste).
--
-- search_log inserta una fila por búsqueda (incluida rate_limited) y nunca se
-- borra. Con Supabase Pro (8 GB) no es una emergencia de espacio, pero conviene
-- por coste e índice ágil. Se purga lo > 90 días con un job diario de pg_cron.
--
-- REQUISITO: la extensión pg_cron debe estar habilitada en el proyecto Supabase
-- (Dashboard → Database → Extensions → pg_cron). create extension la habilita si
-- el rol tiene permiso; si falla, habilítala desde el panel y reaplica.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job idempotente: cron.schedule(name, ...) reescribe el job si ya existe (pg_cron >= 1.4).
-- Diario a las 03:00 UTC. term_hash/client_hash son hashes, no PII.
SELECT cron.schedule(
  'purge-search-log',
  '0 3 * * *',
  $$DELETE FROM public.search_log WHERE created_at < now() - interval '90 days'$$
);
