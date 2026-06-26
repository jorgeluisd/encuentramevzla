-- ============================================================================
-- 0002_rls.sql — Row Level Security y grants
--
-- REQUISITO INNEGOCIABLE:
--   * El rol anónimo (anon) NO tiene acceso a NINGUNA tabla de datos.
--   * El schema `sensitive` jamás recibe grants para anon (ni siquiera USAGE).
--   * El acceso público sucede EXCLUSIVAMENTE vía el RPC public.search_patient
--     (SECURITY DEFINER) definido en 0003. La separación física público/sensitive
--     y ese SECURITY DEFINER son la columna vertebral de la privacidad: no negociar.
-- ============================================================================

-- --- Habilitar RLS en todas las tablas de datos ---
ALTER TABLE public.hospitals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_rows     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_log   ENABLE ROW LEVEL SECURITY;

ALTER TABLE sensitive.contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive.clinical_notes  ENABLE ROW LEVEL SECURITY;

-- Forzar RLS también para los dueños de tabla (defensa en profundidad).
ALTER TABLE public.patients    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admissions  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals   FORCE ROW LEVEL SECURITY;
ALTER TABLE sensitive.contacts        FORCE ROW LEVEL SECURITY;
ALTER TABLE sensitive.clinical_notes  FORCE ROW LEVEL SECURITY;

-- --- DENEGAR acceso al rol anónimo ---
-- Sin políticas que permitan a `anon`, RLS deniega por defecto. Además revocamos
-- privilegios explícitamente para no depender de los grants por defecto.
REVOKE ALL ON ALL TABLES    IN SCHEMA public   FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public   FROM anon;

-- El schema `sensitive` no es ni siquiera "usable" por anon ni authenticated.
REVOKE ALL ON SCHEMA sensitive FROM anon, authenticated;
REVOKE ALL ON ALL TABLES    IN SCHEMA sensitive FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sensitive FROM anon, authenticated;

-- Asegurar que futuros objetos en `sensitive` tampoco se concedan por defecto.
ALTER DEFAULT PRIVILEGES IN SCHEMA sensitive REVOKE ALL ON TABLES FROM anon, authenticated;

-- NOTA: el rol `service_role` (backend / ingesta / worker) salta RLS por diseño de
-- Supabase y es el único que escribe en estas tablas. anon solo ejecuta el RPC mediado.
