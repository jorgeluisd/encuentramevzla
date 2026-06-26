-- ============================================================================
-- 0007_buscar_paciente_nombres.sql — El buscador devuelve el NOMBRE del adulto.
--
-- Decisión (ADR-0002, spec 0005): con consentimiento de la dueña del dato, se abren
-- los nombres de pacientes ADULTOS VIVOS, agrupados por hospital. La rama sensible
-- (menores/fallecidos -> requiere_contacto_humano), el umbral conservador y el log por
-- hash NO cambian: la apertura aplica solo al bloque publicable.
--
-- Único cambio vs 0006: el jsonb publicable añade 'paciente_nombre'. El dedupe por
-- hospital+persona ya lo da el GROUP BY existente (un resultado por persona-hospital).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_paciente(termino text)
RETURNS TABLE (resultado jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_termino_norm  text;
  v_doc_norm      text;
  v_termino_hash  text;
  v_best_sensible numeric := 0;
  v_best_public   numeric := 0;
  v_match_count   bigint := 0;
BEGIN
  v_termino_norm := lower(unaccent(coalesce(termino, '')));
  v_termino_norm := btrim(regexp_replace(v_termino_norm, '\s+', ' ', 'g'));
  -- Documento normalizado del término (alfanumérico en mayúsculas).
  v_doc_norm := upper(regexp_replace(coalesce(termino, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(regexp_replace(v_doc_norm, '\D', '', 'g')) < 6 THEN
    v_doc_norm := NULL; -- no parece una cédula válida
  END IF;
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
             CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%' THEN 0.5 ELSE 0 END,
             CASE WHEN v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm THEN 1 ELSE 0 END
           ) AS strength
    FROM public.personas p
    WHERE (p.es_menor OR p.estado = 'fallecido')
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm))
  ) s;

  -- Fuerza de la mejor coincidencia publicable.
  SELECT coalesce(max(strength), 0) INTO v_best_public
  FROM (
    SELECT greatest(
             similarity(p.nombre_normalizado, v_termino_norm),
             CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%' THEN 0.5 ELSE 0 END,
             CASE WHEN v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm THEN 1 ELSE 0 END
           ) AS strength
    FROM public.personas p
    JOIN public.ingresos i ON i.persona_id = p.id
    JOIN public.hospitales h ON h.id = i.hospital_id
    WHERE p.es_menor = false
      AND p.estado <> 'fallecido'
      AND h.activo = true
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm))
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
             'paciente_nombre',        p.nombre_normalizado,
             'confianza', round(
               greatest(
                 similarity(p.nombre_normalizado, v_termino_norm),
                 CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%' THEN 0.5 ELSE 0 END,
                 CASE WHEN v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm THEN 1 ELSE 0 END
               )::numeric, 2)
           )
    FROM public.personas p
    JOIN public.ingresos i ON i.persona_id = p.id
    JOIN public.hospitales h ON h.id = i.hospital_id
    WHERE p.es_menor = false
      AND p.estado <> 'fallecido'
      AND h.activo = true
      AND (p.nombre_normalizado ILIKE '%' || v_termino_norm || '%'
           OR similarity(p.nombre_normalizado, v_termino_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm))
    GROUP BY h.nombre, h.telefono_mesa_info, p.nombre_normalizado, p.doc_numero_normalizado
    ORDER BY greatest(
               similarity(p.nombre_normalizado, v_termino_norm),
               CASE WHEN p.nombre_normalizado ILIKE '%' || v_termino_norm || '%' THEN 0.5 ELSE 0 END,
               CASE WHEN v_doc_norm IS NOT NULL AND p.doc_numero_normalizado = v_doc_norm THEN 1 ELSE 0 END
             ) DESC
    LIMIT 10;

  GET DIAGNOSTICS v_match_count = ROW_COUNT;
  INSERT INTO public.busqueda_log (termino_hash, resultado_tipo)
  VALUES (v_termino_hash, CASE WHEN v_match_count > 0 THEN 'coincidencias' ELSE 'sin_resultados' END);
END;
$$;
