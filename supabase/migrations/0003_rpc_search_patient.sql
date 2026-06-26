-- ============================================================================
-- 0003_rpc_search_patient.sql — Buscador mediado (SECURITY DEFINER).
--
-- Único acceso público a los datos. Matchea por nombre o cédula y:
--   * adultos vivos  -> devuelve nombre + hospital + mesa de información, agrupado por
--     hospital (decisión "abierta", ADR-0002 / spec 0005). Dedupe por hospital+paciente.
--   * menores/fallecidos -> { requires_human_contact: true } (NUNCA su nombre).
--   * término < 4 chars -> { invalid_term: true }.
-- Anti-enumeración: search_log guarda SOLO el hash del término, nunca el texto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_patient(term text)
RETURNS TABLE (result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_term_norm     text;
  v_doc_norm      text;
  v_term_hash     text;
  v_best_sensitive numeric := 0;
  v_best_public   numeric := 0;
  v_match_count   bigint := 0;
BEGIN
  v_term_norm := lower(unaccent(coalesce(term, '')));
  v_term_norm := btrim(regexp_replace(v_term_norm, '\s+', ' ', 'g'));
  -- Documento normalizado del término (alfanumérico en mayúsculas).
  v_doc_norm := upper(regexp_replace(coalesce(term, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(regexp_replace(v_doc_norm, '\D', '', 'g')) < 6 THEN
    v_doc_norm := NULL; -- no parece una cédula válida
  END IF;
  v_term_hash := encode(digest(v_term_norm, 'sha256'), 'hex');

  IF length(v_term_norm) < 4 THEN
    INSERT INTO public.search_log (term_hash, result_type)
    VALUES (v_term_hash, 'invalid_term');
    RETURN QUERY SELECT jsonb_build_object('invalid_term', true);
    RETURN;
  END IF;

  -- Fuerza de la mejor coincidencia sensible (menor/fallecido).
  SELECT coalesce(max(strength), 0) INTO v_best_sensitive
  FROM (
    SELECT greatest(
             similarity(p.normalized_name, v_term_norm),
             CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.5 ELSE 0 END,
             CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END
           ) AS strength
    FROM public.patients p
    WHERE (p.is_minor OR p.status = 'deceased')
      AND (p.normalized_name ILIKE '%' || v_term_norm || '%'
           OR similarity(p.normalized_name, v_term_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm))
  ) s;

  -- Fuerza de la mejor coincidencia publicable.
  SELECT coalesce(max(strength), 0) INTO v_best_public
  FROM (
    SELECT greatest(
             similarity(p.normalized_name, v_term_norm),
             CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.5 ELSE 0 END,
             CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END
           ) AS strength
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    JOIN public.hospitals h ON h.id = a.hospital_id
    WHERE p.is_minor = false
      AND p.status <> 'deceased'
      AND h.active = true
      AND (p.normalized_name ILIKE '%' || v_term_norm || '%'
           OR similarity(p.normalized_name, v_term_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm))
  ) s;

  -- Contacto humano solo si lo sensible domina (empate incluido = conservador).
  IF v_best_sensitive > 0 AND v_best_sensitive >= v_best_public THEN
    INSERT INTO public.search_log (term_hash, result_type)
    VALUES (v_term_hash, 'requires_human_contact');
    RETURN QUERY SELECT jsonb_build_object('requires_human_contact', true);
    RETURN;
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
             'hospital_name',    h.name,
             'info_desk_phone',  h.info_desk_phone,
             'patient_name',     p.normalized_name,
             'confidence', round(
               greatest(
                 similarity(p.normalized_name, v_term_norm),
                 CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.5 ELSE 0 END,
                 CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END
               )::numeric, 2)
           )
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    JOIN public.hospitals h ON h.id = a.hospital_id
    WHERE p.is_minor = false
      AND p.status <> 'deceased'
      AND h.active = true
      AND (p.normalized_name ILIKE '%' || v_term_norm || '%'
           OR similarity(p.normalized_name, v_term_norm) > 0.3
           OR (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm))
    GROUP BY h.name, h.info_desk_phone, p.normalized_name, p.normalized_doc_number
    ORDER BY greatest(
               similarity(p.normalized_name, v_term_norm),
               CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.5 ELSE 0 END,
               CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END
             ) DESC
    LIMIT 10;

  GET DIAGNOSTICS v_match_count = ROW_COUNT;
  INSERT INTO public.search_log (term_hash, result_type)
  VALUES (v_term_hash, CASE WHEN v_match_count > 0 THEN 'matches' ELSE 'no_results' END);
END;
$$;
