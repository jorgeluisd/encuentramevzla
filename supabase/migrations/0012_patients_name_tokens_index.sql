-- ============================================================================
-- 0012_patients_name_tokens_index.sql — Índice GIN sobre patients.name_tokens.
--
-- La ingesta (spec 0019) prefiltra candidatos con `name_tokens && ARRAY[tokens]`
-- (comparten ≥1 token de nombre) en vez de cargar toda la tabla. El índice GIN
-- sobre el array acelera ese operador de solape. Aditivo, no cambia resultados.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patients_name_tokens
  ON public.patients USING gin (name_tokens);
