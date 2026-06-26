-- ============================================================================
-- 0006_search_patient_show_all.sql — El buscador informa la ubicación en TODOS
-- los casos (incluidos menores y fallecidos).
--
-- DECISIÓN HUMANA (2026-06-26, dueña del dato): tras el sismo, las familias
-- necesitan saber EN QUÉ HOSPITAL está la persona. Se retira el gate que devolvía
-- { requires_human_contact: true } para menores/fallecidos. Ahora toda coincidencia
-- devuelve hospital + nombre + mesa de información, como el resto.
--
-- ⚠️ Esto SUPERA la regla previa "menores/fallecidos nunca se exponen" (spec 0005 /
-- ADR-0002 / privacy-and-security). Registrado en spec 0015 + ADR-0003.
-- Se mantiene el matching AND por token (0005) y el anti-enumeración (search_log solo hash).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_patient(term text)
RETURNS TABLE (result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_term_norm   text;
  v_tokens      text[];
  v_doc_norm    text;
  v_term_hash   text;
  v_match_count bigint := 0;
BEGIN
  v_term_norm := lower(unaccent(coalesce(term, '')));
  v_term_norm := btrim(regexp_replace(v_term_norm, '\s+', ' ', 'g'));
  v_tokens := string_to_array(v_term_norm, ' ');
  v_doc_norm := upper(regexp_replace(coalesce(term, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(regexp_replace(v_doc_norm, '\D', '', 'g')) < 6 THEN
    v_doc_norm := NULL;
  END IF;
  v_term_hash := encode(digest(v_term_norm, 'sha256'), 'hex');

  IF length(v_term_norm) < 4 THEN
    INSERT INTO public.search_log (term_hash, result_type)
    VALUES (v_term_hash, 'invalid_term');
    RETURN QUERY SELECT jsonb_build_object('invalid_term', true);
    RETURN;
  END IF;

  -- Todas las coincidencias (sin filtrar menores/fallecidos), con matching AND por token.
  RETURN QUERY
    SELECT jsonb_build_object(
             'hospital_name',    h.name,
             'info_desk_phone',  h.info_desk_phone,
             'patient_name',     p.normalized_name,
             'confidence', round(
               greatest(
                 CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END,
                 CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.9 ELSE 0 END,
                 word_similarity(v_term_norm, p.normalized_name)
               )::numeric, 2)
           )
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id = p.id
    JOIN public.hospitals h ON h.id = a.hospital_id
    WHERE h.active = true
      AND (
        (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm)
        OR NOT EXISTS (
          SELECT 1 FROM unnest(v_tokens) AS tok
          WHERE p.normalized_name NOT ILIKE '%' || tok || '%'
            AND word_similarity(tok, p.normalized_name) < 0.6
        )
      )
    GROUP BY h.name, h.info_desk_phone, p.normalized_name, p.normalized_doc_number
    ORDER BY greatest(
               CASE WHEN v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm THEN 1 ELSE 0 END,
               CASE WHEN p.normalized_name ILIKE '%' || v_term_norm || '%' THEN 0.9 ELSE 0 END,
               word_similarity(v_term_norm, p.normalized_name)
             ) DESC
    LIMIT 10;

  GET DIAGNOSTICS v_match_count = ROW_COUNT;
  INSERT INTO public.search_log (term_hash, result_type)
  VALUES (v_term_hash, CASE WHEN v_match_count > 0 THEN 'matches' ELSE 'no_results' END);
END;
$$;
