# Spec 0023 — Directorio de servicios solidarios (profesionales voluntarios)

Estado: **en implementación** (GATE 1 aprobado; código verde local, pendiente GATE 2) · Rama: `feat/0023-solidarity-services` (desde `develop`)
Capacidad nueva: `solidarity-services` (`@evzla/core`). Independiente de `patient-registry`.
Reutiliza: 0016 (Turnstile anti-abuso), 0009 (cola de revisión), 0007 (roles), Resend (0022/bienvenida).

## 1. Motivación

Tras el sismo, personas y profesionales quieren **ofrecer servicios gratuitos** (inspección
estructural, salud, impresión 3D, legal, etc.). Se necesita un **directorio público solidario**
donde publiquen su oferta y los damnificados los contacten **directamente por teléfono**.

Es el **inverso de privacidad** del buscador de pacientes: aquí quien publica **quiere** ser
contactado, así que **no** hay mediación tipo "coincidencia en Hospital X". Pero se mantiene el
resto de la constitución: el anónimo nunca consulta tablas directo (lectura por RPC
`SECURITY DEFINER`), control anti-abuso (Turnstile + rate-limit), y **ningún dato privado** (el
email de quien publica) se expone.

Diseño de referencia: `draft/designs/servicios gratuitos.html` (export Canva, abierto sin auth ni
dueño). Se toma como referencia **visual**; se descarta su modelo (borrado anónimo de terceros y
alta sin freno).

## 2. Alcance y decisiones (acordadas con el residente/Jorge)

1. **Identidad:** anónimo + moderación. Sin cuentas nuevas (no se crea clase de usuario público
   autenticado). Se reutiliza el staff existente y el rol `moderator`.
2. **Moderación previa:** nada es público hasta que un `moderator` lo aprueba (`pending → approved`).
3. **Edición/baja del profesional:** **enlace mágico por email** (sin cuenta). Se pide su email al
   publicar; se guarda **solo el hash** del token; el token en claro viaja solo en el enlace.
   Editar **re-entra a `pending`** (anti bait-and-switch); dar de baja es inmediato.
4. **Categoría:** **lista fija generosa** + "Otro" (value object de dominio, sin `pgEnum`, para
   ampliar sin migración).
5. **Límite:** máximo **3 publicaciones activas** (`pending`+`approved`) por email.
6. **Caducidad:** **90 días**. Se fija `expires_at` al publicar y se **renueva** al aprobar/editar.
   El listado público filtra `expires_at > now()`.
7. **SEO:** el listado público **se indexa** (sitemap/robots) para maximizar difusión.
8. **Consentimiento:** checkbox obligatorio de publicación pública + aceptación de términos; se
   sella `accepted_terms_at`.

Taxonomía inicial (`ServiceCategory`): Salud y primeros auxilios · Salud mental / apoyo psicológico ·
Ingeniería y evaluación estructural · Construcción y albañilería · Electricidad · Plomería /
fontanería · Búsqueda y rescate · Legal y notarial · Transporte y logística · Alojamiento temporal ·
Alimentación y agua · Ropa y enseres · Impresión 3D y fabricación · Tecnología y conectividad ·
Traducción y comunicaciones · Cuidado infantil · Cuidado de adultos mayores · Veterinaria y
mascotas · Voluntariado general · Otro.

## 3. Diseño técnico (capas onion)

### 3.1 Dominio — `packages/core/src/solidarity-services/domain/`
Value objects (constructor privado + factory `fromRaw`, patrón `normalized-phone.ts`):
- `ServiceTitle` — trim; `isValid` si longitud ∈ [3, 120].
- `ServiceDescription` — trim; `isValid` si longitud ∈ [10, 1000].
- `ServiceCategory` — `isValid` solo si el valor ∈ lista fija (export `SERVICE_CATEGORIES`).
- `ContactPhone` — **reutiliza** `NormalizedPhone` (validez por últimos 7 dígitos).
- `SubmitterEmail` — trim/lower; `isValid` con forma básica de email.
- `ServiceStatus` — unión `"pending" | "approved" | "rejected" | "removed" | "expired"` + guards.
Errores de dominio: `InvalidServiceInputError`, `TermsNotAcceptedError`,
`TooManyActiveServicesError`, `ServiceNotFoundError`, `ServiceModerationForbiddenError`.

### 3.2 Aplicación — `.../application/`
Ports (`ports/`):
- `SolidarityServiceRepository` (write, service_role): `create(record)`,
  `countActiveByEmail(email)`, `listByStatus({status, limit, offset}) → {items, total}`,
  `findByTokenHash(hash)`, `updateById(id, changes)`.
- `SolidarityServiceDirectory` (read público mediado): `list({category?, q?}) → PublicService[]`.
- `ServiceConfirmationMailer` (best-effort): `sendConfirmation({email, editUrl})`.

Use cases (`use-cases/`, cada uno con `.test.ts` colocado):
- `SubmitSolidarityService` — inyecta `newToken:()=>string` y `hashToken:(t)=>string` (patrón
  `newId` de `ingestPatientListUseCase`). Valida VOs, exige `acceptedTerms`, aplica límite de 3,
  crea `status=pending`, `expires_at = now + 90d`, guarda `edit_token_hash`. Devuelve
  `{ id, editToken (raw), expiresAt }`.
- `ListPublishedServices` — delega en `SolidarityServiceDirectory.list`.
- `ListPendingServices` — paginado, `listByStatus('pending', …)` (patrón `ListReviewQueue`).
- `ApproveService` / `RejectService` — guard `canModerate(role)`; setean estado, `reviewed_at/by`,
  (`rejection_reason` en reject), y **renuevan** `expires_at` al aprobar.
- `EditServiceByToken` — resuelve por `hashToken(raw)`; valida cambios; `status=pending`,
  renueva `expires_at`. `RemoveServiceByToken` — `status=removed` inmediato.
Re-export en `packages/core/src/index.ts`.

### 3.3 Infraestructura — `apps/web/lib/infrastructure/solidarity-services/`
- `DrizzleSolidarityServiceRepository` (write, `getDb()`).
- `SupabaseSolidarityServiceDirectory` (read, `createAnonClient()` + `rpc('list_solidarity_services')`).
- `ResendServiceConfirmationMailer` + template `templates/service-confirmation-email.ts` (best-effort:
  sin API key = no-op, no bloquea el alta; patrón `resend-welcome-mailer.ts`).
- Token/hash: la Server Action genera el token (`crypto.randomUUID()`) y el hash (SHA-256), y los
  inyecta al use case (dominio se mantiene puro, sin crypto).

### 3.4 Presentación
- `apps/web/lib/composition.ts` — factories por use case cableando adapters.
- `apps/web/lib/actions/servicios.ts` — Server Actions delgadas:
  `submitServiceAction` (Turnstile `verifyHumanChallengeUseCase` + `hashIp` rate-limit),
  `editServiceAction`, `removeServiceAction`, `approveServiceAction`/`rejectServiceAction`
  (guardadas con `requireModerator`, patrón `requireManager` de `equipo.ts`).
- Rutas:
  - `app/servicios/page.tsx` — público: listado (approved) + filtro categoría/texto + formulario alta.
  - `app/servicios/editar/[token]/page.tsx` — público: editar/baja por enlace mágico.
  - `app/servicios/terminos/page.tsx` (o bloque colapsable) — términos de publicación.
  - `app/admin/(protected)/servicios/page.tsx` — moderación (patrón `/admin/review`).
  - Enlaces de nav: público (home) + `/admin` (bajo `canModerate`).
  - `sitemap.ts`/`robots.ts`: incluir `/servicios`.

### 3.5 Datos y RPC
- `packages/db/src/schema/public.ts` — tabla `solidarity_services` (schema `public`, **no**
  `sensitive`; el teléfono es público por diseño). Columnas: `id` uuid pk, `title`, `category`,
  `description`, `contact_phone` (público), `submitter_email` (**privado**), `status` text,
  `edit_token_hash` text, `accepted_terms_at` ts, `expires_at` ts, `rejection_reason` text,
  `reviewed_by` uuid, `reviewed_at` ts, `created_at`, `updated_at`.
- `supabase/migrations/0016_solidarity_services.sql`:
  1. `CREATE TABLE public.solidarity_services (…)`.
  2. `ENABLE`/`FORCE ROW LEVEL SECURITY`; `REVOKE ALL … FROM anon, authenticated` (sin políticas → RLS deniega).
  3. RPC `public.list_solidarity_services(p_category text DEFAULT NULL, p_q text DEFAULT NULL)`
     `SECURITY DEFINER SET search_path = public, extensions`: devuelve **solo** filas
     `status='approved' AND expires_at > now()` y **solo columnas públicas**
     (`id, title, category, description, contact_phone, created_at`) — **nunca** `submitter_email`
     ni `edit_token_hash`. Filtro opcional por `p_category` y por texto (`ILIKE`/`unaccent`).
  4. `GRANT EXECUTE ON FUNCTION public.list_solidarity_services … TO anon;` (único grant nuevo al anónimo).
  5. Escrituras solo por `service_role` (Drizzle), que salta RLS por diseño.

## 4. Implicaciones de privacidad (checklist skill `privacy-and-security.md`)

- [x] **NO** toca el schema `sensitive`. La tabla vive en `public`.
- [x] **NO** toca `search_patient` ni datos de pacientes/menores/fallecidos. Capacidad independiente.
- [x] El **email** de quien publica es **privado**: jamás lo devuelve el RPC ni ninguna vista.
- [x] El **token** de edición se guarda **solo como hash** (filosofía del hash de `search_log`).
- [x] Único grant nuevo al anónimo: `EXECUTE` sobre `list_solidarity_services` (lectura mediada,
      whitelist de columnas, solo `approved` + no-caducado). Sin `SELECT` directo a la tabla.
- [x] El **teléfono es público por diseño y con consentimiento explícito** del titular (checkbox +
      `accepted_terms_at`). No es un dato de tercero involuntario.

## 5. Criterios de aceptación (dirigen el TDD, convertibles 1:1 a Vitest)

Dominio:
- `ServiceTitle.fromRaw("  ").isValid === false`; `fromRaw("Inspección estructural").isValid === true`.
- `ServiceDescription.fromRaw("corto").isValid === false` (< 10); texto de 200 chars `=== true`.
- `ServiceCategory.fromRaw("Legal y notarial").isValid === true`;
  `ServiceCategory.fromRaw("Cripto").isValid === false`.
- `SubmitterEmail.fromRaw("a@b.co").isValid === true`; `fromRaw("a@b").isValid === false`.
- `ContactPhone` reutiliza `NormalizedPhone` (ya cubierto por sus tests).

`SubmitSolidarityService`:
- Con input válido + `acceptedTerms:true` y `countActiveByEmail → 0`: crea `status="pending"`,
  `expiresAt = now + 90d`, persiste `edit_token_hash = hashToken(token)` y devuelve el token en claro.
- `acceptedTerms:false` ⇒ lanza `TermsNotAcceptedError` y **no** persiste.
- `countActiveByEmail → 3` ⇒ lanza `TooManyActiveServicesError` y **no** persiste.
- Título/categoría/teléfono inválidos ⇒ `InvalidServiceInputError`.

`ApproveService`/`RejectService`:
- `role="uploader"` ⇒ `ServiceModerationForbiddenError` (no cambia estado).
- `role="moderator"` + approve ⇒ `status="approved"`, `reviewedAt=now`, `expiresAt = now + 90d`.
- reject ⇒ `status="rejected"` con `rejectionReason`.

`EditServiceByToken`/`RemoveServiceByToken`:
- token inexistente (`findByTokenHash → null`) ⇒ `ServiceNotFoundError`.
- edit válido ⇒ aplica cambios, `status="pending"`, renueva `expiresAt`.
- remove ⇒ `status="removed"` (inmediato).

`ListPublishedServices`: delega y devuelve solo lo que el directorio (RPC) entrega (approved + vigentes).

Integración/manual (Gate 2): RPC `list_solidarity_services` **nunca** devuelve `submitter_email`
ni `edit_token_hash`; el rol anónimo **no** puede `SELECT` la tabla directo.

## 6. Lista de tareas (Strict TDD ON/OFF)

| # | Tarea | Capa | TDD |
|---|---|---|---|
| T1 | Value objects (`ServiceTitle`, `ServiceDescription`, `ServiceCategory`, `SubmitterEmail`, `ServiceStatus`) + `SERVICE_CATEGORIES` | domain core | **ON** |
| T2 | Errores de dominio | domain core | OFF (triviales; se cubren vía use cases) |
| T3 | Ports (`SolidarityServiceRepository`, `SolidarityServiceDirectory`, `ServiceConfirmationMailer`) | app core | OFF (interfaces) |
| T4 | `SubmitSolidarityService` (límite 3, consentimiento, token/hash, expiry) | app core | **ON** |
| T5 | `ApproveService` / `RejectService` (guard `canModerate`) | app core | **ON** |
| T6 | `EditServiceByToken` / `RemoveServiceByToken` (por hash de token) | app core | **ON** |
| T7 | `ListPendingServices` (paginado) + `ListPublishedServices` | app core | **ON** |
| T8 | Barrel `index.ts` (re-exports) | app core | OFF |
| T9 | Tabla Drizzle `solidarity_services` en `public.ts` | db | OFF |
| T10 | Migración `0016_solidarity_services.sql` (tabla + RLS + RPC + grant) | supabase | OFF (verificación manual/integración) |
| T11 | Adapters (Drizzle repo, Supabase directory, Resend mailer + template) | infra web | **ON** (repo/directory con test de mapeo) |
| T12 | `composition.ts` factories | infra web | OFF |
| T13 | Server Actions `servicios.ts` (Turnstile + rate-limit + `requireModerator`) | web | **ON** (validación/guards) |
| T14 | Rutas y UI (`/servicios`, `/servicios/editar/[token]`, `/admin/servicios`, términos) + nav + sitemap | web | OFF (UI; e2e manual) |
| T15 | Copy legal (checkbox + términos) | copy | OFF |

## 7. Fuera de alcance (post-MVP)

- Reportar publicación desde el listado público.
- Verificación de identidad del profesional.
- Métricas/analítica del directorio.
- Job/cron de archivado: por ahora el filtro `expires_at > now()` del RPC basta para ocultar caducados.
- Endurecimiento "clic para ver teléfono" contra scraping (queda como mejora posterior).

## 8. Testing / Definition of Done

- TDD en `@evzla/core` (T1, T4–T7, T11, T13). RED (FAIL) antes de GREEN, evidencia en apply-progress.
- Verde antes de PR: `pnpm typecheck` (4/4) `&& pnpm test && pnpm lint && pnpm build`.
- E2E manual (Chrome MCP): publicar → pendiente en `/admin/servicios` → aprobar → aparece en
  `/servicios` → abrir enlace mágico → editar (vuelve a pendiente) → dar de baja.
- Verificación de privacidad: query directa comprobando que el RPC no expone `submitter_email`/token
  y que `anon` no puede leer la tabla.

## 9. Apply-progress y verificación (GATE 2)

**Strict TDD (RED→GREEN por tarea, runner Vitest 4):** T1 value objects (20 tests), T4 `SubmitSolidarityService`
(+ `service-expiry`, 6 tests), T5/T6/T7 moderación/token/listados (RED confirmado antes del GREEN),
T11 adapter directory (mapeo + no-leak, 3 tests). Suite final: **core 227 + web 21 = 248 PASS**.
Verifier: `pnpm typecheck` (core/db/web) · `pnpm lint` (core+web) · `pnpm build` OK.

**E2E manual (2026-07-05, Supabase local `127.0.0.1:54322`, migración 0016 aplicada; prod intacta):**
1. Privacidad por query: `anon` → `SELECT` a la tabla = `permission denied`; RPC como `anon` devuelve solo
   `approved`+vigentes, sin `submitter_email` ni `edit_token_hash` (`leaks_email=f, leaks_token=f`);
   pendiente y caducada excluidas; búsqueda acento-insensible OK.
2. Alta pública (navegador): formulario en `/servicios` → "Recibimos tu publicación… en revisión";
   fila `pending`, email guardado privado, token solo como hash, `expires_at = +90d`; RPC público = 0.
3. Aprobación (simulada a nivel DB = lo que hace `ApproveService`): la tarjeta aparece en `/servicios`
   (RPC + directorio), sin exponer el email.
4. Enlace mágico `/servicios/editar/[token]`: prefill correcto por hash; editar → "Volverá a revisión"
   (`status=pending`, título actualizado); dar de baja → `status=removed`, RPC = 0, y la página de gestión
   pasa a "Enlace no válido" (guard de `removed`).

**Nota:** el panel `/admin/servicios` compila (200) y queda correctamente gateado (redirige a login sin
sesión). No se condujo por navegador el login OTP local (la plantilla de correo local trae magic-link PKCE,
no OTP numérico → brecha de config local, no del código); la lógica de moderación queda cubierta por los
tests de `ApproveService`/`RejectService`. La migración 0016 **no** se ha aplicado a producción.
