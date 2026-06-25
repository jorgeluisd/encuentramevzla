-- ============================================================================
-- 0003_rpc_buscar_paciente.sql — Búsqueda pública MEDIADA
--
-- REQUISITO INNEGOCIABLE: este es el ÚNICO punto de entrada del público a los datos.
--   * SECURITY DEFINER: corre con los privilegios del dueño (que sí ve las tablas),
--     mientras que `anon` no tiene acceso directo a ninguna tabla (ver 0002).
--   * Devuelve SOLO { hospital_nombre, hospital_telefono_mesa, confianza }.
--     NUNCA datos de la persona ni nada del schema `sensible`.
--   * Menores de edad o fallecidos => NO se devuelven por el buscador:
--     se entrega el marcador { requiere_contacto_humano: true }.
--   * Registra el HASH del término (anti-enumeración), nunca el texto.
-- ============================================================================

-- Tipo de retorno: una fila puede ser una coincidencia normal o el marcador humano.
-- Se modela como JSON para poder mezclar ambos casos de forma simple y segura.
CREATE OR REPLACE FUNCTION public.buscar_paciente(termino text)
RETURNS TABLE (resultado jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions   -- fijar search_path es obligatorio en SECURITY DEFINER
AS $$
DECLARE
  v_termino_norm   text;
  v_termino_hash   text;
  v_hay_sensible   boolean := false;
  v_hay_coincid    boolean := false;
BEGIN
  -- --- Validación: término mínimo de 4 caracteres ---
  v_termino_norm := lower(unaccent(coalesce(termino, '')));
  v_termino_norm := regexp_replace(v_termino_norm, '\s+', ' ', 'g');
  v_termino_norm := btrim(v_termino_norm);

  v_termino_hash := encode(digest(v_termino_norm, 'sha256'), 'hex');

  IF length(v_termino_norm) < 4 THEN
    INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
    VALUES (v_termino_hash, 'termino_invalido');
    RETURN QUERY SELECT jsonb_build_object('termino_invalido', true);
    RETURN;
  END IF;

  -- TODO(rate-limit): antes de seguir, limitar nº de búsquedas por IP/sesión y ventana
  -- de tiempo (p. ej. consultando public.busqueda_log o un contador en Redis) para
  -- frenar enumeración masiva. Aquí iría el chequeo y el RAISE/return si se excede.

  -- --- ¿Existe algún match que sea menor o fallecido? -> contacto humano ---
  SELECT EXISTS (
    SELECT 1
    FROM public.personas p
    WHERE (p.es_menor = true OR p.estado = 'fallecido')
      AND (
        p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
        OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3
      )
  ) INTO v_hay_sensible;

  IF v_hay_sensible THEN
    INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
    VALUES (v_termino_hash, 'requiere_contacto_humano');
    RETURN QUERY SELECT jsonb_build_object('requiere_contacto_humano', true);
    RETURN;
  END IF;

  -- --- Coincidencias publicables (ni menores ni fallecidos) ---
  -- Devuelve SOLO datos del hospital + confianza. Nada de la persona.
  RETURN QUERY
    SELECT jsonb_build_object(
             'hospital_nombre',        h.nombre,
             'hospital_telefono_mesa', h.telefono_mesa_info,
             'confianza',              round(
                                         greatest(
                                           similarity(p.nombre_normalizado, v_termino_norm),
                                           CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
                                                THEN 0.5 ELSE 0 END
                                         )::numeric, 2)
           )
    FROM public.personas p
    JOIN public.ingresos i ON i.persona_id = p.id
    JOIN public.hospitales h ON h.id = i.hospital_id
    WHERE p.es_menor = false
      AND p.estado <> 'fallecido'
      AND h.activo = true
      AND (
        p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
        OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3
      )
    GROUP BY h.nombre, h.telefono_mesa_info, p.nombre_normalizado
    ORDER BY 1 DESC
    LIMIT 10;

  GET DIAGNOSTICS v_hay_coincid = ROW_COUNT;

  INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
  VALUES (v_termino_hash, CASE WHEN v_hay_coincid THEN 'coincidencias' ELSE 'sin_resultados' END);
END;
$$;

-- digest()/similarity() viven en la extensión pgcrypto / pg_trgm. Aseguramos pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- El público SOLO puede ejecutar esta función; ningún acceso directo a tablas.
REVOKE ALL ON FUNCTION public.buscar_paciente(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_paciente(text) TO anon, authenticated;
