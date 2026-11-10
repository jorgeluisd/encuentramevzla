# 0029 function-url-oac: apply progress

## T-1 — interceptor `content-hash-fetch`   estado: terminada
TDD: ON (lógica con riesgo de privacidad; capa presentation/lib, modo estricto)
Safety net: N/A para el archivo (solo archivos nuevos). Línea base del paquete: `pnpm --filter @evzla/web test` → 15 files, 61 passed (2026-11-10T01:56:59Z) · `pnpm --filter @evzla/web typecheck` → sin errores (no lo registra el hook).
Archivos tocados: `apps/web/lib/origin-signing/content-hash-fetch.ts`, `apps/web/lib/origin-signing/content-hash-fetch.test.ts`   Desviaciones respecto al plan: ninguna

TDD Cycle Evidence (comando base: `pnpm --filter @evzla/web test -- lib/origin-signing/content-hash-fetch.test.ts`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED (inválido) | hashes the exact UTF-8 bytes of a same-origin string body | base + `-t "string body"` | FAIL — `Failed to parse URL from /buscar` en el helper del test; se corrigió el helper, no cuenta | 2026-11-10T01:59:15Z |
| RED | hashes the exact UTF-8 bytes of a same-origin string body (AC-1) | base + `-t "string body"` | FAIL — `expected null to be '0390c6…'` (sin header) · Tests 1 failed (1) | 2026-11-10T01:59:26Z |
| GREEN | ídem | base + `-t "string body"` | PASS — Tests 1 passed (1) | 2026-11-10T01:59:34Z |
| RED | serializes a FormData body once and hashes the multipart bytes it sends (AC-2) | base + `-t "FormData body once"` | FAIL — hash de `String(body)` ≠ hash de los bytes multipart · Tests 1 failed \| 1 skipped (2) | 2026-11-10T01:59:42Z |
| GREEN | ídem | base + `-t "FormData body once"` | PASS — Tests 1 passed \| 1 skipped (2) | 2026-11-10T01:59:50Z |
| RED | passes a same-origin GET/HEAD/get through untouched; bare call (AC-4) | base + `-t "through untouched"` | FAIL — `Request with GET/HEAD method cannot have body` · Tests 4 failed \| 2 skipped (6) | 2026-11-10T01:59:59Z |
| GREEN | ídem | base + `-t "through untouched"` | PASS — Tests 4 passed \| 2 skipped (6) | 2026-11-10T02:00:06Z |
| RED | sends a cross-origin PUT to … exactly as given (AC-5; S3 prefirmado, otro host, otro esquema) | base + `-t "cross-origin PUT"` | FAIL — recibió un `Request` con header en vez del input original · Tests 3 failed \| 6 skipped (9) | 2026-11-10T02:00:14Z |
| GREEN | ídem | base + `-t "cross-origin PUT"` | PASS — Tests 3 passed \| 6 skipped (9) | 2026-11-10T02:00:19Z |
| RED (inválido) | sends the request unchanged … when crypto.subtle is unavailable | base + `-t "crypto.subtle is unavailable"` | FAIL — el parámetro por defecto del helper reinyectaba `subtle`; se corrigió el helper, no cuenta | 2026-11-10T02:00:26Z |
| RED | ídem (AC-7) | base + `-t "crypto.subtle is unavailable"` | FAIL — `Cannot read properties of undefined (reading 'digest')` · Tests 1 failed \| 9 skipped (10) | 2026-11-10T02:00:35Z |
| GREEN | ídem | base + `-t "crypto.subtle is unavailable"` | PASS — Tests 1 passed \| 9 skipped (10) | 2026-11-10T02:00:42Z |
| RED | falls back to the original arguments without logging when hashing fails (AC-8, fallback) | base + `-t "hashing fails"` | FAIL — la promesa rechaza con el error sintético · Tests 1 failed \| 10 skipped (11) | 2026-11-10T02:00:52Z |
| GREEN | ídem | base + `-t "hashing fails"` | PASS — Tests 1 passed \| 10 skipped (11) | 2026-11-10T02:01:02Z |
| RED | replaces window.fetch with the hashing wrapper bound to the window (esqueleto vacío) | base + `-t "replaces window.fetch"` | FAIL — el fetch original recibió el string sin envolver · Tests 1 failed \| 11 skipped (12) | 2026-11-10T02:01:27Z |
| GREEN | ídem | base + `-t "replaces window.fetch"` | PASS — Tests 1 passed \| 11 skipped (12) | 2026-11-10T02:01:39Z |
| TRIANGULATE | PUT/PATCH/DELETE/post (AC-1), POST vacío = `e3b0…b855` (AC-3), `Request` same-origin, mismo FormData dos veces y concurrencia (AC-6), error de red sin reintento, escaneo estático (AC-8) | base | PASS — Tests 22 passed (22) | 2026-11-10T02:02:06Z |
| REFACTOR | extracción de `methodOf`, `toHex`, `withContentHash` | base | PASS — Tests 22 passed (22) | 2026-11-10T02:02:20Z |
| REFACTOR | restauración de espías en `afterEach` | base | PASS — Tests 22 passed (22) | 2026-11-10T02:02:31Z |

Checks locales: typecheck ✔ (`pnpm --filter @evzla/web typecheck` → `tsc --noEmit` sin errores) · lint ✔ (`pnpm --filter @evzla/web lint` → `eslint .` sin hallazgos) · tests ✔ (22 passed, 2026-11-10T02:02:31Z)
Commit: 40657a4 feat(web): add same-origin content hash fetch interceptor
Decisiones menores:
- Los casos de TRIANGULATE pasaron de entrada: son guardas de AC que el diseño cumple por construcción (`new Request` para cualquier body, sin estado de módulo, `fetch` fuera del `try`). No se presentan como RED.
- Tipo `ContentHashFetchTarget` mínimo (`fetch`, `location.origin`, `crypto?.subtle`) para que `installContentHashFetch(window)` compile y sea testeable sin DOM.
- Un único comentario de porqué sobre `withContentHash` (bytes firmados = bytes enviados, ADR-0012).
Notas para el verifier: los fixtures son sintéticos (`Persona Prueba`, `V-00000000`); la salida de los RED muestra hashes de esos fixtures, no de datos reales.

## T-2 — instalación del interceptor en `instrumentation-client.ts`   estado: terminada
TDD: OFF (cableado de una línea; lo cubren AC-9 en T-8 y el chequeo del artefacto en T-9, según el plan)
Safety net: N/A (archivo nuevo)
Archivos tocados: `apps/web/instrumentation-client.ts`   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence: no aplica (TDD OFF)
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → exit 0) · lint ✔ (`pnpm exec eslint instrumentation-client.ts lib/origin-signing` → exit 0) · tests: sin tests propios del archivo
Commit: ec72bcc feat(web): install content hash fetch before hydration
Decisiones menores: el archivo solo importa y llama `installContentHashFetch(window)`; Next 16 lo carga antes de hidratar.
Notas para el verifier: la instalación real se valida en C1 (T-8) y con el grep del artefacto (T-9).

## T-3 — hook `useHydrated`   estado: terminada
TDD: ON (presentation/lib)
Safety net: N/A (solo archivos nuevos)
Archivos tocados: `apps/web/lib/origin-signing/use-hydrated.ts`, `apps/web/lib/origin-signing/use-hydrated.test.ts`   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | reports not hydrated while rendering on the server (AC-10, SSR) — esqueleto `return true` | `pnpm --filter @evzla/web test -- lib/origin-signing/use-hydrated.test.ts` | FAIL — `expected '<span>true</span>' to be '<span>false</span>'` · Tests 1 failed (1) | 2026-11-10T02:12:13Z |
| GREEN | ídem, con `useSyncExternalStore(noopSubscribe, () => true, () => false)` | ídem | PASS — Tests 1 passed (1) | 2026-11-10T02:12:23Z |
| TRIANGULATE | — | — | no aplica: la rama cliente (`true` tras hidratar, AC-11) necesita DOM y el plan la asigna a C1 (T-8) | — |
| REFACTOR | — | — | sin cambios tras GREEN | — |
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → exit 0) · lint ✔ (`pnpm exec eslint lib/origin-signing` → exit 0) · tests ✔ (1 passed, 2026-11-10T02:12:23Z)
Commit: 716f210 feat(web): add useHydrated hook for submit gating
Decisiones menores: el GREEN implementa directamente la forma del diseño en vez de una constante `false`, porque la constante rompería AC-11 y el caso cliente no es testeable en el entorno `node` de Vitest.
Notas para el verifier: sin jsdom en el paquete; no se agregó dependencia para probar la rama cliente. El commit se enmendó una vez (antes de cualquier push) para incluir este archivo de progreso, que quedó fuera por un `sed` fallido.

## T-4 — componentes `HydratedSubmit` y `JsRequiredNotice`   estado: terminada
TDD: OFF (componentes delgados; los prueban la guarda de T-5 y C1, según el plan)
Safety net: N/A (solo archivos nuevos)
Archivos tocados: `apps/web/components/ui/hydrated-submit.tsx`, `apps/web/components/ui/js-required-notice.tsx`   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence: no aplica (TDD OFF)
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → exit 0) · lint ✔ (`pnpm exec eslint components/ui/hydrated-submit.tsx components/ui/js-required-notice.tsx` → exit 0) · tests: sin tests propios
Commit: 1533c23 feat(web): add hydration-gated submit and noscript notice
Decisiones menores:
- `HydratedSubmitProps = Omit<ButtonProps, "type">`: deja pasar `formAction`, `name`, `value`, `variant`, `title` (lo que pide el diseño) y además `className`, `size`, `children` y demás atributos del botón, para que la migración de T-5 no pierda estilos. `type` queda fijo en `"submit"` y `disabled = !hydrated || disabled`.
- `JsRequiredNotice` sin `"use client"` ni hooks, así sirve en server y en client; texto en español con el token `text-danger` ya usado en la app.
- Un comentario de porqué en `HydratedSubmit` (envío nativo antes de hidratar → 403 tras R3, ADR-0012).
Notas para el verifier: ningún formulario usa todavía estos componentes; la migración es T-5.

## T-5 — guarda AST `HydratedSubmit` + migración de los 15 formularios   estado: terminada
TDD: ON (la guarda se escribió primero y falló; la migración va en la misma tarea, aprobado en GATE 1)
Safety net (sesión T-5..T-7): `pnpm --filter @evzla/web test -- --reporter=dot` → Test Files 17 passed (17) Tests 84 passed (84) (2026-11-10T02:16:34Z) · `pnpm --filter @evzla/infra test -- --reporter=dot` → Test Files 7 passed (7) Tests 276 passed (276) (2026-11-10T02:17:16Z) · `pnpm typecheck` → Tasks: 5 successful, 5 total (no lo registra el hook). Los formularios tocados no tienen tests propios.
Archivos tocados: `apps/web/lib/origin-signing/hydrated-submit-guard.test.ts` (nuevo), `apps/web/app/admin/(protected)/layout.tsx`, `apps/web/app/admin/(protected)/review/review-case-actions.tsx`, `apps/web/app/admin/(protected)/foreign-rows/foreign-row-actions.tsx`, `apps/web/components/search-panel.tsx`, `apps/web/components/servicios/submit-service-form.tsx`, `apps/web/components/servicios/report-service-button.tsx`, `apps/web/components/servicios/manage-service-form.tsx`, `apps/web/components/servicios/services-admin-browser.tsx`
Desviaciones respecto al plan: ninguna. El plan habla de "9 archivos" pero enumera 8; son 8 archivos de formularios (los 15 formularios están en esos 8), más el test.

TDD Cycle Evidence (comando: `pnpm --filter @evzla/web test -- lib/origin-signing/hydrated-submit-guard.test.ts`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED (inválido) | suite completa del archivo | ídem | FAIL — `ReferenceError: describe is not defined` (el paquete web no tiene globals de Vitest); se agregó el import de `vitest`, no cuenta | 2026-11-10T02:19:55Z |
| RED | routes every <form action> and formAction … through HydratedSubmit (AC-13) · puts a JsRequiredNotice inside every public <form action> (AC-14) | ídem | FAIL — 29 violaciones `archivo:línea:col` sobre los 15 formularios inventariados (14 `<form action>` + el `formAction` de foreign-row-actions) y 5 formularios públicos sin `JsRequiredNotice` · Tests 2 failed \| 4 passed (6) | 2026-11-10T02:20:01Z |
| GREEN | ídem, tras migrar los 8 archivos | ídem | PASS — Tests 6 passed (6) | 2026-11-10T02:21:16Z |
| TRIANGULATE | casos negativos inline: `<form action>` con `Button type="submit"` (2 violaciones con línea:col), `button` sin `type`, `formAction` fuera de `HydratedSubmit`, caso positivo con "Fusionar" `type="button"` y conteo de `formAction` | ídem (en la misma corrida RED/GREEN) | PASS en RED y en GREEN: prueban la propia guarda (código de test), no producción; no se presentan como RED | 2026-11-10T02:20:01Z / 2026-11-10T02:21:16Z |
| REFACTOR | `lib/origin-signing` completo (guarda + interceptor + hook) | `pnpm --filter @evzla/web test -- lib/origin-signing` | PASS — Test Files 3 passed (3) Tests 29 passed (29) | 2026-11-10T02:22:28Z |

Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → exit 0) · lint ✔ (`pnpm exec eslint lib/origin-signing app components` → exit 0) · tests ✔ (29 passed, 2026-11-10T02:22:28Z)
Commit: PENDIENTE-T5
Decisiones menores:
- "Formulario detectado" = cada `<form>` con atributo `action` más cada `HydratedSubmit` con `formAction` (foreign-row-actions: un `<form>` sin `action` cuyo `SubmitButton` envuelve `HydratedSubmit`). Total en el repo: 15; la guarda exige ≥ 15.
- La guarda vive entera en el test (sin módulo de producción): es una verificación estática, no código de la app.
- AC-14 se verifica sobre la lista fija de los 4 archivos públicos; los admin no requieren `JsRequiredNotice`.
- `JsRequiredNotice` se ubica junto al botón de envío, dentro del `<form>`.
Notas para el verifier: "Fusionar" (review-case-actions) sigue `type="button"` y la guarda lo acepta; los demás `Button type="button"` de esos formularios no cambian. `Button` sigue importado en review-case-actions y report-service-button porque lo usan botones no submit.
