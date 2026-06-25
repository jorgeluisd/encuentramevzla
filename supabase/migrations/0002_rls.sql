-- ============================================================================
-- 0002_rls.sql — Row Level Security y grants
--
-- REQUISITO INNEGOCIABLE:
--   * El rol anónimo (anon) NO tiene acceso a NINGUNA tabla de datos.
--   * El schema `sensible` jamás recibe grants para anon (ni siquiera USAGE).
--   * El acceso público sucede EXCLUSIVAMENTE vía el RPC public.buscar_paciente
--     (SECURITY DEFINER) definido en 0003. La separación física público/sensible
--     y ese SECURITY DEFINER son la columna vertebral de la privacidad: no negociar.
-- ============================================================================

-- --- Habilitar RLS en todas las tablas de datos ---
ALTER TABLE public.hospitales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_filas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busqueda_log      ENABLE ROW LEVEL SECURITY;

ALTER TABLE sensible.contacto                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensible.observaciones_clinicas  ENABLE ROW LEVEL SECURITY;

-- Forzar RLS también para los dueños de tabla (defensa en profundidad).
ALTER TABLE public.personas      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hospitales    FORCE ROW LEVEL SECURITY;
ALTER TABLE sensible.contacto                FORCE ROW LEVEL SECURITY;
ALTER TABLE sensible.observaciones_clinicas  FORCE ROW LEVEL SECURITY;

-- --- DENEGAR acceso al rol anónimo ---
-- Sin políticas que permitan a `anon`, RLS deniega por defecto. Además revocamos
-- privilegios explícitamente para no depender de los grants por defecto.
REVOKE ALL ON ALL TABLES    IN SCHEMA public   FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public   FROM anon;

-- El schema `sensible` no es ni siquiera "usable" por anon ni authenticated.
REVOKE ALL ON SCHEMA sensible FROM anon, authenticated;
REVOKE ALL ON ALL TABLES    IN SCHEMA sensible FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sensible FROM anon, authenticated;

-- Asegurar que futuros objetos en `sensible` tampoco se concedan por defecto.
ALTER DEFAULT PRIVILEGES IN SCHEMA sensible REVOKE ALL ON TABLES FROM anon, authenticated;

-- NOTA: el rol `service_role` (backend / ingesta / worker) salta RLS por diseño de
-- Supabase y es el único que escribe en estas tablas. anon solo ejecuta el RPC mediado.
