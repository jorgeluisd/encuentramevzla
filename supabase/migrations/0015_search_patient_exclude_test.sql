-- ============================================================================
-- 0015_search_patient_exclude_test.sql — Excluir hospitales de PRUEBA del buscador.
--
-- Nuevo flag `hospitals.test`: un hospital con test=true (y todos sus pacientes vía
-- admissions) NO aparece en el RPC público `search_patient`, pero SÍ sigue visible en
-- el portal /admin (listActive filtra solo por active, no por test) para poder cargarle
-- pacientes de prueba por el flujo normal.
--
-- La ALTER deja todos los hospitales existentes en test=false → cero cambio de
-- comportamiento para los datos ya cargados. El RPC es copia EXACTA de 0011 (pre-filtro
-- trigram, score, orden, rate-limit y log idénticos); lo único que cambia es que al
-- `WHERE h.active = true` se le añade `AND h.test = false`.
-- ============================================================================

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.search_patient(term text, client_hash text DEFAULT NULL)
RETURNS TABLE (result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_term_norm    text;
  v_tokens       text[];
  v_doc_norm     text;
  v_term_hash    text;
  v_match_count  bigint := 0;
  v_recent_count bigint := 0;
  c_window       interval := interval '10 minutes';
  c_max_requests bigint   := 300;
BEGIN
  -- Igualar el umbral de `%>` (pre-filtro) con el < 0.6 del refinamiento exacto.
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.6', true);

  v_term_norm := lower(unaccent(coalesce(term, '')));
  v_term_norm := btrim(regexp_replace(v_term_norm, '\s+', ' ', 'g'));
  v_tokens := string_to_array(v_term_norm, ' ');
  v_doc_norm := upper(regexp_replace(coalesce(term, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(regexp_replace(v_doc_norm, '\D', '', 'g')) < 6 THEN
    v_doc_norm := NULL;
  END IF;
  v_term_hash := encode(digest(v_term_norm, 'sha256'), 'hex');

  IF client_hash IS NOT NULL THEN
    SELECT count(*) INTO v_recent_count
    FROM public.search_log sl
    WHERE sl.client_hash = search_patient.client_hash
      AND sl.created_at > now() - c_window;

    IF v_recent_count >= c_max_requests THEN
      INSERT INTO public.search_log (term_hash, result_type, client_hash)
      VALUES (v_term_hash, 'rate_limited', search_patient.client_hash);
      RETURN QUERY SELECT jsonb_build_object('rate_limited', true);
      RETURN;
    END IF;
  END IF;

  IF length(v_term_norm) < 4 THEN
    INSERT INTO public.search_log (term_hash, result_type, client_hash)
    VALUES (v_term_hash, 'invalid_term', search_patient.client_hash);
    RETURN QUERY SELECT jsonb_build_object('invalid_term', true);
    RETURN;
  END IF;

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
      AND h.test = false
      AND (
        (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm)
        OR (
          -- Pre-filtro index-usable (condición NECESARIA: el 1er token debe pasar).
          ( p.normalized_name ILIKE '%' || v_tokens[1] || '%'
            OR p.normalized_name %> v_tokens[1] )
          -- Refinamiento exacto IDÉNTICO a 0008 (AND por token).
          AND NOT EXISTS (
            SELECT 1 FROM unnest(v_tokens) AS tok
            WHERE p.normalized_name NOT ILIKE '%' || tok || '%'
              AND word_similarity(tok, p.normalized_name) < 0.6
          )
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
  INSERT INTO public.search_log (term_hash, result_type, client_hash)
  VALUES (v_term_hash, CASE WHEN v_match_count > 0 THEN 'matches' ELSE 'no_results' END, search_patient.client_hash);
END;
$$;
