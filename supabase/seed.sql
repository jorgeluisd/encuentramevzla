-- ============================================================================
-- seed.sql — Datos de ejemplo MÍNIMOS y CLARAMENTE FICTICIOS.
--
-- ⚠️ NO contiene datos reales de pacientes. Todo es inventado para poder probar el
--    flujo localmente. Borrar antes de cualquier despliegue con datos reales.
-- ============================================================================

INSERT INTO public.hospitales (nombre, telefono_mesa_info, ciudad, activo)
VALUES
  ('Hospital de Ejemplo Norte', '+58-000-0000000', 'Ciudad Ficticia', true),
  ('Hospital de Ejemplo Sur',   '+58-000-0000001', 'Ciudad Ficticia', true)
ON CONFLICT DO NOTHING;

-- (Sin personas/ingresos sembrados: no inventamos pacientes ni siquiera ficticios
--  para el buscador. Los hospitales bastan para probar la estructura.)
