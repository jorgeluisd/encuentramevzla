-- ============================================================================
-- 0007_search_patient_rate_limit.sql — Anti-abuso: rate-limit por fuente en el RPC.
--
-- Tras 0006 (ubicación visible en TODOS los casos), el buscador queda expuesto a
-- ENUMERACIÓN automatizada. Se añade un límite de frecuencia por cliente:
--   * El server pasa client_hash = sha256(ip + salt) (NUNCA la IP en claro).
--   * El RPC cuenta las búsquedas recientes de ese client_hash y, si exceden el
--     umbral en la ventana, devuelve { rate_limited: true } sin ejecutar la query.
-- search_log gana la columna client_hash (sigue siendo SOLO un hash, sin PII).
-- result_type admite ahora: invalid_term | matches | no_results | rate_limited.
-- Complemento de la capa Turnstile (verificación de humanidad, en la app).
-- ============================================================================

-- Hash de la fuente (no PII). Nullable por compat con llamadas sin contexto de IP.
ALTER TABLE public.search_log ADD COLUMN IF NOT EXISTS client_hash text;

-- Índice para contar rápido las búsquedas recientes de una misma fuente.
CREATE INDEX IF NOT EXISTS idx_search_log_client_window
  ON public.search_log (client_hash, created_at);

-- Cierra el bypass del overload: la firma vieja de 1 arg (sin client_hash) NO
-- aplicaba rate-limit. Se elimina para que el único acceso sea la firma de 2 args.
DROP FUNCTION IF EXISTS public.search_patient(text);

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
  -- Umbrales tunables del rate-limit.
  c_window       interval := interval '10 minutes';
  c_max_requests bigint   := 30;
BEGIN
  v_term_norm := lower(unaccent(coalesce(term, '')));
  v_term_norm := btrim(regexp_replace(v_term_norm, '\s+', ' ', 'g'));
  v_tokens := string_to_array(v_term_norm, ' ');
  v_doc_norm := upper(regexp_replace(coalesce(term, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(regexp_replace(v_doc_norm, '\D', '', 'g')) < 6 THEN
    v_doc_norm := NULL;
  END IF;
  v_term_hash := encode(digest(v_term_norm, 'sha256'), 'hex');

  -- Rate-limit por fuente: solo si llega client_hash (server con contexto de IP).
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
  INSERT INTO public.search_log (term_hash, result_type, client_hash)
  VALUES (v_term_hash, CASE WHEN v_match_count > 0 THEN 'matches' ELSE 'no_results' END, search_patient.client_hash);
END;
$$;
