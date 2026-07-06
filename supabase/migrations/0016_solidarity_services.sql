-- ============================================================================
-- 0016_solidarity_services.sql — Directorio público de servicios solidarios (spec 0023).
--
-- Es el INVERSO de privacidad del buscador de pacientes: aquí `contact_phone` es
-- público POR DISEÑO (con consentimiento explícito del titular). PERO se mantiene la
-- columna vertebral de privacidad del proyecto:
--   * anon NO tiene acceso directo a la tabla (RLS deniega + REVOKE explícito).
--   * El público lee SOLO por el RPC `list_solidarity_services` (SECURITY DEFINER),
--     que devuelve únicamente filas `approved` y no caducadas, y SOLO columnas
--     públicas — nunca `submitter_email` ni `edit_token_hash`.
--   * Escribe solo `service_role` (Server Actions), que salta RLS por diseño.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.solidarity_services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  category          text NOT NULL,
  description       text NOT NULL,
  contact_phone     text NOT NULL,               -- público
  submitter_email   text NOT NULL,               -- PRIVADO (solo enlace de gestión)
  status            text NOT NULL DEFAULT 'pending',
  edit_token_hash   text NOT NULL,               -- solo el HASH del token
  accepted_terms_at timestamptz NOT NULL,
  expires_at        timestamptz NOT NULL,
  rejection_reason  text,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Listado público: filtra por estado + vigencia, ordena por más recientes.
CREATE INDEX IF NOT EXISTS solidarity_services_public_idx
  ON public.solidarity_services (status, expires_at, created_at DESC);

-- Resolución del enlace mágico por hash de token.
CREATE INDEX IF NOT EXISTS solidarity_services_token_idx
  ON public.solidarity_services (edit_token_hash);

-- Conteo del límite de 3 activas por email.
CREATE INDEX IF NOT EXISTS solidarity_services_email_idx
  ON public.solidarity_services (submitter_email);

-- --- RLS: denegar todo a anon/authenticated (igual que el resto de tablas de datos) ---
ALTER TABLE public.solidarity_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_services FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.solidarity_services FROM anon, authenticated;

-- ============================================================================
-- RPC público de lectura mediada. Whitelist de columnas: jamás email ni token.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_solidarity_services(
  p_category text DEFAULT NULL,
  p_q        text DEFAULT NULL
)
RETURNS TABLE (result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_q text;
BEGIN
  v_q := nullif(btrim(lower(unaccent(coalesce(p_q, '')))), '');

  RETURN QUERY
    SELECT jsonb_build_object(
             'id',            s.id,
             'title',         s.title,
             'category',      s.category,
             'description',   s.description,
             'contact_phone', s.contact_phone,
             'created_at',    s.created_at
           )
    FROM public.solidarity_services s
    WHERE s.status = 'approved'
      AND s.expires_at > now()
      AND (p_category IS NULL OR s.category = p_category)
      AND (
        v_q IS NULL
        OR lower(unaccent(s.title))       LIKE '%' || v_q || '%'
        OR lower(unaccent(s.description))  LIKE '%' || v_q || '%'
        OR lower(unaccent(s.category))     LIKE '%' || v_q || '%'
      )
    ORDER BY s.created_at DESC
    LIMIT 500;
END;
$$;

-- El único grant nuevo al rol anónimo: EJECUTAR el RPC (no SELECT directo a la tabla).
GRANT EXECUTE ON FUNCTION public.list_solidarity_services(text, text) TO anon;
