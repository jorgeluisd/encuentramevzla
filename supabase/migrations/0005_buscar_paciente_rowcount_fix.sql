-- ============================================================================
-- 0005_buscar_paciente_rowcount_fix.sql — Corrige un bug de tipo en el RPC.
--
-- BUG (heredado de 0003/0004): `v_hay_coincid` se declaraba boolean y se le asignaba
-- `GET DIAGNOSTICS ... = ROW_COUNT` (entero). Con 0–1 filas colaba ('0'/'1' → boolean),
-- pero con 2+ coincidencias Postgres fallaba: "invalid input syntax for type boolean".
-- FIX: usar un contador entero (bigint) y comparar > 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_paciente(termino text)
RETURNS TABLE (resultado jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_termino_norm  text;
  v_termino_hash  text;
  v_best_sensible numeric := 0;
  v_best_public   numeric := 0;
  v_match_count   bigint := 0;   -- antes era boolean (causa del bug)
BEGIN
  v_termino_norm := lower(unaccent(coalesce(termino, '')));
  v_termino_norm := btrim(regexp_replace(v_termino_norm, '\s+', ' ', 'g'));
  v_termino_hash := encode(digest(v_termino_norm, 'sha256'), 'hex');

  IF length(v_termino_norm) < 4 THEN
    INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
    VALUES (v_termino_hash, 'termino_invalido');
    RETURN QUERY SELECT jsonb_build_object('termino_invalido', true);
    RETURN;
  END IF;

  -- Fuerza de la mejor coincidencia sensible (menor/fallecido).
  SELECT coalesce(max(strength), 0) INTO v_best_sensible
  FROM (
    SELECT greatest(
             similarity(p.nombre_normalizado, v_termino_norm),
             CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
                  THEN 0.5 ELSE 0 END
           ) AS strength
    FROM public.personas p
    WHERE (p.es_menor OR p.estado = 'fallecido')
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3)
  ) s;

  -- Fuerza de la mejor coincidencia publicable.
  SELECT coalesce(max(strength), 0) INTO v_best_public
  FROM (
    SELECT greatest(
             similarity(p.nombre_normalizado, v_termino_norm),
             CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
                  THEN 0.5 ELSE 0 END
           ) AS strength
    FROM public.personas p
    JOIN public.ingresos i ON i.persona_id = p.id
    JOIN public.hospitales h ON h.id = i.hospital_id
    WHERE p.es_menor = false
      AND p.estado <> 'fallecido'
      AND h.activo = true
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3)
  ) s;

  -- Contacto humano solo si lo sensible domina (empate incluido = conservador).
  IF v_best_sensible > 0 AND v_best_sensible >= v_best_public THEN
    INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
    VALUES (v_termino_hash, 'requiere_contacto_humano');
    RETURN QUERY SELECT jsonb_build_object('requiere_contacto_humano', true);
    RETURN;
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
             'hospital_nombre',        h.nombre,
             'hospital_telefono_mesa', h.telefono_mesa_info,
             'confianza', round(
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
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3)
    GROUP BY h.nombre, h.telefono_mesa_info, p.nombre_normalizado
    ORDER BY greatest(
               similarity(p.nombre_normalizado, v_termino_norm),
               CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
                    THEN 0.5 ELSE 0 END
             ) DESC
    LIMIT 10;

  GET DIAGNOSTICS v_match_count = ROW_COUNT;
  INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
  VALUES (v_termino_hash, CASE WHEN v_match_count > 0 THEN 'coincidencias' ELSE 'sin_resultados' END);
END;
$$;
