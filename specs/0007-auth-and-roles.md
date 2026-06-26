# 0007 — Auth magic-link + roles del equipo

Estado: **en progreso** · Rama: `feat/auth-magic-link` (desde `develop`).
Capas: domain (Role) · application (port + use case) · infrastructure (Drizzle + Supabase SSR) ·
presentation (`/admin/*`, `/auth/callback`). Privacidad: ver `.claude/skills/privacy-and-security.md`.

> Objetivo: que solo **personal verificado** entre al portal `/admin`. Login **sin contraseña**
> (magic-link de Supabase), acceso por **allow-list** (membresía en `team_members`) y **roles**
> (`uploader` / `moderator`). Esta entrega es el **alcance A**: login + roles + guard +
> `uploadedBy`/audit *registrados*. La **vista** del audit log (moderador) va en una PR siguiente.

## 0. Decisiones (cerradas con Jorge, 2026-06-26)

- **Magic-link** Supabase (email OTP), sin contraseña (CLAUDE.md prohíbe que el agente maneje
  contraseñas; el magic-link encaja).
- **Roles en DB**: tabla `public.team_members` (no en `app_metadata`).
- **Allow-list**: solo emails con membresía **activa** acceden a `/admin`. Un email no listado
  puede autenticarse pero el guard lo **rechaza** (sin rol).
- **Seed inicial**: `diazjorgeluis10@gmail.com` como `moderator`. Se siembra **fuera del repo**
  (SQL one-off), no hardcodeado en la migración (no commitear emails personales).

## 1. DB — migración `0004_team_members.sql` + Drizzle

Enum y tabla en `public` (idempotente, estilo `0001`):

```sql
-- enum team_role: uploader | moderator
-- public.team_members (
--   id uuid pk default gen_random_uuid(),
--   email text not null unique,            -- minúsculas; clave de match con la sesión
--   role public.team_role not null,
--   hospital_id uuid references public.hospitals(id),  -- nullable (moderador global)
--   active boolean not null default true,
--   created_at timestamptz not null default now()
-- )
```

**RLS (extiende `0002`)**: `ENABLE` + `FORCE ROW LEVEL SECURITY`; `REVOKE ALL` para `anon` y
`authenticated`. La tabla se lee **server-side** por Drizzle (`DATABASE_URL`, salta RLS), igual que
la ingesta. **El rol anónimo y el `authenticated` (anon key) nunca leen `team_members`.**

Schema Drizzle: `team_role` en `enums.ts`, `teamMembers` en `public.ts`, tipos `TeamMemberRow` /
`NewTeamMember` en `index.ts`.

> El email es la **clave de unión** sesión↔membresía. Se guarda y compara en **minúsculas**.

## 2. Dominio (TDD) — `@evzla/core`

`domain/value-objects/team-role.ts`:
- `export type Role = "uploader" | "moderator"`.
- `isRole(value: string): value is Role`.
- `canUpload(role: Role): boolean` → ambos (uploader y moderator pueden subir listas).
- `canModerate(role: Role): boolean` → solo `moderator`.

**Criterios (TDD):** `canUpload("uploader") === true`; `canUpload("moderator") === true`;
`canModerate("uploader") === false`; `canModerate("moderator") === true`;
`isRole("admin") === false`; `isRole("uploader") === true`.

## 3. Aplicación — port + use case

`application/ports/team-member-repository.ts`:
```ts
export interface TeamMember { id: string; email: string; role: Role; hospitalId: string | null; active: boolean; }
export interface TeamMemberRepository { findByEmail(email: string): Promise<TeamMember | null>; }
```

`application/use-cases/resolve-team-member.ts` — `ResolveTeamMember`:
- Normaliza el email (trim + lowercase) y consulta el repo.
- Devuelve `{ kind: "authorized", member }` si existe y `active`; si no, `{ kind: "unauthorized" }`.
- **TDD** con un repo fake: miembro activo → authorized; inactivo → unauthorized; inexistente →
  unauthorized; email con mayúsculas/espacios → normaliza y encuentra.

## 4. Infraestructura

- `DrizzleTeamMemberRepository` (en `apps/web/lib/infrastructure/...`) → `findByEmail` sobre
  `@evzla/db` (`getDb()`), `where lower(email) = lower($1)`, `active`.
- **`@supabase/ssr`** (`pnpm add @supabase/ssr`):
  - `lib/supabase/ssr-server.ts` — `createServerClient` con adaptador de cookies de Next
    (lectura de sesión en server components y route handlers).
  - `lib/supabase/ssr-browser.ts` — `createBrowserClient` (cookies) para la página de login.
  - `middleware.ts` (raíz de `apps/web`) — refresca la sesión en cada request a `/admin/*`.
  - Helper `getSessionEmail()` (server) → email de la sesión o `null`.
- Composition root: `resolveTeamMemberUseCase()` inyecta el repo Drizzle.

## 5. Presentación

- **`/admin/login`** (client): input de **correo institucional** → `supabase.auth.signInWithOtp({
  email, options: { emailRedirectTo: <origin>/auth/callback } })`. Estados: inicial · **enviado**
  ("Revisa tu correo… caduca en 15 min" + "Usar otro correo") · error. Copys del concepto 0004 B1.
- **`/auth/callback`** (route handler): `exchangeCodeForSession(code)` → set cookies → redirect a
  `/admin/ingesta`. Si falla → `/admin/login?error=...`.
- **Guard `/admin/layout.tsx`** (server): `getSessionEmail()`; sin sesión → redirect `/admin/login`.
  Con sesión → `ResolveTeamMember`; si `unauthorized` → pantalla de **acceso denegado** (sin datos)
  + Salir. Si `authorized` → renderiza, expone el `member` (rol) a las páginas. Chip de usuario
  (email + rol) + botón **Salir** (server action `signOut`).
- **`uploadedBy` real + audit**: `subirExcelAction` obtiene el `member` autorizado, pasa
  `uploadedBy: member.id` al caso de uso y registra una entrada en `audit_log`
  (`action: "ingest", entity: "raw_rows", actorId: member.id`). La tabla "Cargas recientes" muestra
  el email del miembro en "Subido por".

> Gate por rol: `/admin/ingesta` exige `canUpload(member.role)`. La futura vista del audit log
> exigirá `canModerate`. El público (`/`, `/buscar`, `/confianza`) **no** se toca.

## 6. Verificación

- TDD verde de `team-role` y `ResolveTeamMember` (RED→GREEN, evidencia Vitest).
- `pnpm typecheck && pnpm test && pnpm build` verdes.
- Aplicar `0004` en la DB + seed de Jorge (`moderator`); probar: sin sesión redirige a login;
  email no miembro → denegado; miembro → entra; `uploadedBy` se registra.

## 7. Prerrequisito de ops (no es código)

Dashboard de Supabase: habilitar **Email auth**, plantilla de magic-link y **Redirect URLs**
(`http://localhost:3000/auth/callback` + la de prod). Sin esto el login no completa en runtime,
pero el código queda listo y testeado.

## 8. Fuera de alcance

Vista del audit log para moderador (PR siguiente), cola de revisión humana (#3),
Turnstile/rate-limit (#4), gestión de miembros desde UI (alta/baja se hace por SQL por ahora).
