-- ============================================================================
-- 0004_team_members.sql — Equipo verificado (auth magic-link + roles)
--
-- REQUISITO INNEGOCIABLE (extiende 0002_rls):
--   * `team_members` es la ALLOW-LIST del portal /admin. Solo emails con membresía
--     ACTIVA pueden entrar. Se lee SIEMPRE server-side (Drizzle / service role).
--   * Ni `anon` ni `authenticated` (anon key del browser) reciben grants sobre esta
--     tabla: el email/rol del equipo no se expone al cliente.
-- ============================================================================

-- --- Enum de rol del equipo ---
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_role') THEN
    CREATE TYPE public.team_role AS ENUM ('uploader', 'moderator');
  END IF;
END$$;

-- --- Tabla de miembros (allow-list) ---
CREATE TABLE IF NOT EXISTS public.team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,             -- minúsculas; clave de unión con la sesión
  role        public.team_role NOT NULL,
  hospital_id uuid REFERENCES public.hospitals(id),  -- nullable: moderador global
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Búsqueda case-insensitive por email (el guard compara en minúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_lower_idx
  ON public.team_members (lower(email));

-- --- RLS: denegar a anon y authenticated (solo se lee por backend) ---
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_members FROM anon, authenticated;

-- NOTA: el seed del primer miembro (moderador) se hace FUERA del repo (SQL one-off),
-- para no versionar emails personales. Ejemplo:
--   INSERT INTO public.team_members (email, role) VALUES ('correo@dominio', 'moderator');
