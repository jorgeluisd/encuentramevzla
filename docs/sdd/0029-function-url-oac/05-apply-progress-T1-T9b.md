# 0029 function-url-oac: apply progress archivado (T-1..T-9b, R1)

Rotado desde 05-apply-progress.md antes de R3. Detalle completo sin cambios.

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
Commit: 686b2e8 feat(web): gate every form submit on hydration with an AST guard
Decisiones menores:
- "Formulario detectado" = cada `<form>` con atributo `action` más cada `HydratedSubmit` con `formAction` (foreign-row-actions: un `<form>` sin `action` cuyo `SubmitButton` envuelve `HydratedSubmit`). Total en el repo: 15; la guarda exige ≥ 15.
- La guarda vive entera en el test (sin módulo de producción): es una verificación estática, no código de la app.
- AC-14 se verifica sobre la lista fija de los 4 archivos públicos; los admin no requieren `JsRequiredNotice`.
- `JsRequiredNotice` se ubica junto al botón de envío, dentro del `<form>`.
Notas para el verifier: "Fusionar" (review-case-actions) sigue `type="button"` y la guarda lo acepta; los demás `Button type="button"` de esos formularios no cambian. `Button` sigue importado en review-case-actions y report-service-button porque lo usan botones no submit.

## T-6 — `/api/revalidate` con `x-revalidate-token`   estado: terminada
TDD: ON (presentation/lib con seguridad, modo estricto)
Safety net: `route.ts` no tiene tests propios; línea base del paquete en T-5 (Tests 84 passed, 2026-11-10T02:16:34Z). `revalidate-request.ts` y su test son nuevos.
Archivos tocados: `apps/web/lib/revalidation/revalidate-request.ts` (nuevo), `apps/web/lib/revalidation/revalidate-request.test.ts` (nuevo), `apps/web/app/api/revalidate/route.ts`   Desviaciones respecto al plan: ninguna

TDD Cycle Evidence (comando base: `pnpm --filter @evzla/web test -- lib/revalidation/revalidate-request.test.ts`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED de API (previa) | revalidates the home when x-revalidate-token matches (AC-15) | base | FAIL — `Cannot find module './revalidate-request'` (símbolo del diseño aún inexistente) · Test Files 1 failed (1) | 2026-11-10T02:23:52Z |
| RED | ídem, contra esqueleto que lanza `not implemented` | base | FAIL — `Error: not implemented` · Tests 1 failed (1) | 2026-11-10T02:24:02Z |
| GREEN | ídem | base | PASS — Tests 1 passed (1) | 2026-11-10T02:24:09Z |
| RED | rejects a missing/wrong/empty x-revalidate-token with 401 unauthorized (AC-16) | base + `-t "AC-16"` | FAIL — `expected 200 to be 401` · Tests 3 failed \| 1 skipped (4) | 2026-11-10T02:24:18Z |
| GREEN | ídem | base + `-t "AC-16"` | PASS — Tests 3 passed \| 1 skipped (4) | 2026-11-10T02:24:26Z |
| RED | answers 503 not_configured when the secret is empty, with no header / an empty header | base + `-t "not_configured"` | FAIL — `expected 401 to be 503` y `expected 200 to be 503` (un secreto vacío autorizaba un header vacío) · Tests 2 failed \| 4 skipped (6) | 2026-11-10T02:24:34Z |
| GREEN | ídem | base + `-t "not_configured"` | PASS — Tests 2 passed \| 4 skipped (6) | 2026-11-10T02:24:40Z |
| TRIANGULATE | ignores a valid Authorization: Bearer token (AC-17) · never reads the body, logs or echoes the token (AC-18) | base | PASS — Tests 8 passed (8). Guardas que el diseño cumple por construcción; no se presentan como RED | 2026-11-10T02:24:55Z |
| REFACTOR | `route.ts` compone `appSecret("REVALIDATE_TOKEN")` + `revalidatePath("/")` | `pnpm --filter @evzla/web test -- lib/revalidation` | PASS — Tests 8 passed (8) | 2026-11-10T02:31:20Z |

Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → `tsc=0`) · lint ✔ (`pnpm exec eslint lib/revalidation app/api/revalidate` → `eslint=0`; la llamada pasó a background por lentitud del disco, línea 2026-11-10T02:28:04Z `exit=?`, resultado leído del output: exit 0) · tests ✔ (8 passed, 2026-11-10T02:31:20Z)
Commit: ba6cad3 feat(web): read the revalidation token from x-revalidate-token
Decisiones menores:
- `RevalidateDeps.token` es el string ya resuelto (la ruta hace `await appSecret(...)`), no una función.
- El cuerpo de error usa `code` (`unauthorized`, `not_configured`) según el diseño; antes la ruta respondía `error`. Ningún llamador del repo lee ese campo.
- La ruta queda con un comentario de 2 líneas (porqué del header propio con OAC); se quitó el docblock anterior de 8 líneas.
Notas para el verifier / security-reviewer: la comparación del token es `!==`, como antes; el diseño fija que el módulo no importa nada (sin `node:crypto`/`timingSafeEqual`). Si se quiere comparación en tiempo constante, es una tarea aparte.

## T-7 — OAC NO_OVERRIDE y permisos de CloudFront (URLs NONE)   estado: terminada
TDD: ON (infrastructure CDK; el `describe("function URL access (ADR-0012)")` se escribió primero y falló)
Safety net: `pnpm --filter @evzla/infra test -- --reporter=dot` → Test Files 7 passed (7) Tests 276 passed (276) (2026-11-10T02:17:16Z)
Archivos tocados: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`   Desviaciones respecto al plan: ninguna

TDD Cycle Evidence (comando: `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | T2 fronts both URLs with their own sigv4 lambda OAC (AC-19) · T3 lets only this distribution invoke the server/image URL (AC-20) | ídem | FAIL — `expected [ { …(2) } ] to have a length of 3 but got 1` (solo el OAC de S3) y `expected [] to have a length of 1 but got +0` (sin permisos de CloudFront) · Tests 3 failed \| 28 passed (31) | 2026-11-10T02:34:28Z |
| RED (sigue) | T3 ×2 tras crear `ServerOac`/`ImageOac` y `CloudFrontInvokeViaUrl` | ídem | FAIL — `expected [] to have a length of 1 but got +0` en `InvokeFunctionUrl`: el helper del test buscaba `FunctionName` → función, pero CDK lo emite como `GetAtt <Url>.FunctionArn`. Producción correcta; se corrigió el helper (`permissionsOn` acepta función o URL) · Tests 2 failed \| 29 passed (31) | 2026-11-10T02:37:14Z |
| GREEN | archivo completo (T1..T6 + L120 + L301 + resto) | ídem | PASS — Tests 31 passed (31) | 2026-11-10T02:41:09Z |
| TRIANGULATE | T1 (AuthType por URL), T4 (permisos `*` ⇔ NONE), T5 (cache policy sin `x-revalidate-token` ni `x-amz-content-sha256`, Distribution sin `Logging`), T6 (`ALL_VIEWER_EXCEPT_HOST_HEADER`) | ídem | PASS ya en el RED (02:34:28Z) y en GREEN: son guardas del estado R1 que pasan a romperse en R2/R3 al cambiar `EXPECTED`; no se presentan como RED | 2026-11-10T02:34:28Z / 2026-11-10T02:41:09Z |
| REFACTOR | — | — | sin cambios tras GREEN | — |

Confirmación pedida: L120 (`serves through CloudFront with the default domain and asset behaviors`) y L301 (`sends x-origin-verify only to the server origin…`) no se modificaron (el diff del test no tiene líneas `-`) y siguen verdes en la primera corrida (RED, 02:34:28Z: solo fallaron T2/T3) y tras la implementación (GREEN, 02:41:09Z: 31 passed). Con `withOriginAccessControl`, el origen del server conserva `x-origin-verify` y su `DomainName` sigue referenciando `SiteServerFunctionFunctionUrl…` (duda abierta 4 del plan resuelta).
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `infra` → `tsc=0`) · lint ✔ (`pnpm exec eslint lib/open-next-site.ts test/evzla-stack.test.ts` → `eslint=0`; la llamada pasó a background por lentitud del disco, resultado leído del output: exit 0) · tests ✔ (31 passed, 2026-11-10T02:41:09Z)
Commit: b80812d feat(infra): sign function URL origins with no-override OAC
Plantilla sintetizada (R1, sin AWS): URLs server e imagen `AuthType: NONE`; 3 OAC (2 `lambda` sigv4 `no-override` + S3); por función: `InvokeFunctionUrl` de `cloudfront.amazonaws.com` sin `FunctionUrlAuthType` (lo crea el OAC), `InvokeFunction` + `InvokedViaFunctionUrl: true` de `cloudfront.amazonaws.com` (manual), ambos con `SourceArn` = distribución de EvzlaStack; siguen los dos permisos `*` de cada URL NONE.
Decisiones menores:
- Los dos `addPermission("CloudFrontInvokeViaUrl", …)` van en un `for` sobre server e imagen, tras crear la distribución.
- Comentario L147 reemplazado por 2 líneas: OAC NO_OVERRIDE sobre URLs NONE durante la secuencia de ADR-0012. Un comentario de 1 línea sobre el permiso manual (aws-cdk#35872).
- Para ver la forma real de los permisos se corrió una vez un test temporal `infra/test/zz-debug-permissions.test.ts` que volcaba los `AWS::Lambda::Permission` al scratchpad; se borró y no está en el diff. Su corrida no es evidencia de ningún ciclo.
Notas para el verifier: el guardrail post-escritura avisa de `no-reply@encuentramevzla.com` en `infra/test/evzla-stack.test.ts`; está en L274/L279 desde antes de esta feature (remitente SES del propio proyecto), no lo introdujo T-7 y queda fuera de alcance. No se ejecutó nada contra AWS (sin `cdk diff`/`deploy`; T-10 es manual).

## T-8 — harness C1 `test:content-hash` (playwright)   estado: terminada
TDD: OFF (harness de verificación; no corre en `pnpm test`)
Safety net: `pnpm --filter @evzla/web test -- --reporter=dot` → `Tests 1 failed | 97 passed (98)` (2026-11-10T02:49:06Z); repetido solo el archivo → `Tests 1 failed | 5 passed (6)` (2026-11-10T02:50:12Z). La falla es `Test timed out in 5000ms` en `hydrated-submit-guard.test.ts > routes every <form action>…` (AC-13): la guarda tarda ~6 s porque el disco externo está saturado por procesos de otros proyectos (estado `U`). T-8 no toca ese archivo ni lo que escanea (`app/`, `components/`); no se parcheó. Ver T-9.
Archivos tocados: `apps/web/e2e/content-hash/run.mjs`, `apps/web/e2e/content-hash/fixture/{next.config.ts,tsconfig.json,instrumentation-client.ts,app/layout.tsx,app/page.tsx,app/actions.ts}`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/tsconfig.json` (exclude `e2e`), `apps/web/eslint.config.mjs` (ignore `e2e/**`), `.gitignore` (`apps/web/e2e/**/.next/`, `apps/web/e2e/**/next-env.d.ts`)
Desviaciones respecto al plan: ninguna de archivos. `pnpm-lock.yaml` trae además el campo `deprecated` de `@smithy/core@3.35.2` (metadato que pnpm refrescó del registry al instalar; no cambia versiones).
Dependencia: `playwright` 1.65.0 exacta (publicada 2026-11-05T18:28Z, > 72 h), deps `playwright-core` 1.65.0; sin scripts de instalación (`ignore-scripts=true` en la config de pnpm, pnpm no pidió aprobar builds). Navegadores: Chrome for Testing 158.0.8127.18 (v1254), WebKit 27.2 (v2388), Firefox 159.0 (v1572).
Corridas del harness (`pnpm --filter @evzla/web test:content-hash`):
| Corrida | Resultado | Fuente |
|---|---|---|
| `SKIP_BUILD=1 node apps/web/e2e/content-hash/run.mjs` (sobre un build previo) | 17 PASS, 1 FAIL: `chromium · S1 → page.goto: Timeout 30000ms exceeded` (primera petición en frío; S1 pasó en webkit y firefox) · `content-hash C1: FAIL (1)` | salida de la tarea en background (no la registra el hook) |
| `pnpm --filter @evzla/web test:content-hash` (build + 3 navegadores), tras agregar un GET de calentamiento | S1..S6 PASS en chromium, webkit y firefox (18/18) · `content-hash C1: PASS` · exit 0 | log 2026-11-10T03:11:19Z (`WARN=backgrounded`, sin resumen: el build tarda > 3 min en este disco); resultado leído del output de la tarea, terminado 03:18:42Z |
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `apps/web` → `tsc=0`) · lint ✔ (`pnpm exec eslint .` en `apps/web` → `eslint=0`) · harness ✔ (`content-hash C1: PASS`)
Commit: ver informe de cierre
Decisiones menores:
- El proxy registra por petición solo `{método, ruta, tipo de content-type, headerPresente, coincide}`; el "S3" falso, `{método, headerPresente, contentTypePreservado}`. Los mensajes de falla imprimen solo esos campos.
- El origen del "S3" se pasa a la página por `?s3=`, para no acoplar el build a puertos.
- Next reescribió el `tsconfig.json` del fixture en el primer build (`jsx: react-jsx`, `include` con `.next/dev/types`); se commitea esa forma para que los builds siguientes no lo modifiquen.
- `SKIP_BUILD=1` y la lista de navegadores por argumento existen para iterar; el comando del plan no los usa.
- Se agregó un GET de calentamiento antes de los escenarios: la primera navegación en frío excedía 30 s en este disco.
Notas para el verifier: se vieron POST `text/plain` (S3, S6) y `multipart/form-data` (S4) firmados y coincidentes; S4 envía `Ñandú Pérez 🌎` y 70 000 bytes aleatorios. `playwright install` borró del caché compartido `chromium-1248`/`chromium_headless_shell-1248` (otra versión de playwright). No quedan procesos de next ni del proxy.

## T-9b — fix de hallazgos medios M1..M4 (06-code-review.md)   estado: terminada
TDD: ON (M1/M2: RED contra mutantes del código, porque el comportamiento ya era correcto y faltaba el test; M3/M4: RED contra el código real)
Safety net: `vitest run lib/origin-signing/content-hash-fetch.test.ts lib/origin-signing/hydrated-submit-guard.test.ts --reporter=dot` → `Tests 1 failed | 27 passed (28)`: `Test timed out in 5000ms` en la guarda AC-13 (falla preexistente ya registrada en T-8; el timeout está en el alcance de esta tarea). Log 2026-11-10T17:36:05Z (`WARN=backgrounded`; resultado leído de la salida de la tarea, no repetido en primer plano porque es justo el timeout que corrige la tarea).
Archivos tocados: `apps/web/lib/origin-signing/content-hash-fetch.ts`, `apps/web/lib/origin-signing/content-hash-fetch.test.ts`, `apps/web/lib/origin-signing/hydrated-submit-guard.test.ts`   Desviaciones respecto al plan: ninguna (`instrumentation-client.ts` no cambia: `window` cumple el nuevo `ContentHashFetchTarget`).

Mutantes (copias en el scratchpad `t9b/<dir>`, el repo no se tocó; comando: `vitest run --root $SCRATCH/t9b/<dir> --reporter=dot`):
- a: `new Request(..., { method: init?.method, body: init?.body })`
- a2: a + `headers: init?.headers` (pierde signal y credentials)
- a3: a2 + `credentials: init?.credentials` (pierde solo el signal)
- b: `new Request(input instanceof Request ? input : url, init)` (sin `.clone()`)
- base-a / base-b: mutantes a y b con el test de HEAD

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| (prueba de supervivencia) | suite de HEAD contra mutante a | `--root t9b/base-a` | PASS — Tests 22 passed (22): el mutante sobrevive | 2026-11-10T17:39:15Z |
| (prueba de supervivencia) | suite de HEAD contra mutante b | `--root t9b/base-b` | PASS — Tests 22 passed (22): el mutante sobrevive | 2026-11-10T17:39:35Z |
| RED (M1) | keeps the init headers, signal and credentials of a string-URL call on the signed request | `--root t9b/mut-a` | FAIL — `expected null to be 'action-id'` · Tests 1 failed \| 23 passed (24) | 2026-11-10T17:40:08Z |
| RED (M2) | falls back to the original Request with its body unread when hashing fails | `--root t9b/mut-b` | FAIL — `bodyUsed`: `expected true to be false` · Tests 1 failed \| 23 passed (24) | 2026-11-10T17:40:33Z |
| TRIANGULATE (M1) | ídem M1 | `--root t9b/mut-a2` | FAIL esperado — `expected 'same-origin' to be 'include'` · Tests 1 failed \| 23 passed (24) | 2026-11-10T17:41:04Z |
| GREEN (M1, M2) | los dos tests nuevos contra el código real | `vitest run lib/origin-signing/content-hash-fetch.test.ts --reporter=dot` | PASS — Tests 24 passed (24) | 2026-11-10T17:41:26Z |
| TRIANGULATE (M1) | ídem M1 | `--root t9b/mut-a3` | FAIL esperado — `signal.aborted`: `expected false to be true` · Tests 1 failed \| 23 passed (24) | 2026-11-10T17:41:44Z |
| REFACTOR previo (M3) | deps `origin` → `location: { href }` leída en cada llamada, resolviendo aún contra el origen | `vitest run lib/origin-signing/content-hash-fetch.test.ts --reporter=dot` | PASS — Tests 24 passed (24) | 2026-11-10T17:43:00Z |
| RED (M3) | resolves the relative URL "" / "?x=1" / "api/x" against the document URL (página `/servicios/abc`) | base + `-t "against the document URL"` | FAIL — `expected 'https://example.test/' to be 'https://example.test/servicios/abc'` (y `/?x=1`, `/api/x`) · Tests 3 failed \| 24 skipped (27) | 2026-11-10T17:44:05Z |
| GREEN (M3) | ídem | base + `-t "against the document URL"` | PASS — Tests 3 passed \| 24 skipped (27) | 2026-11-10T17:45:27Z |
| TRIANGULATE (M3) | URL del documento leída al llamar (navegación de cliente) + `//evil.test/buscar` relativa al protocolo pasa intacta | `vitest run lib/origin-signing/content-hash-fetch.test.ts --reporter=dot` | PASS — Tests 29 passed (29) | 2026-11-10T17:47:05Z |
| RED (M4) | treats <input type="submit"> and <input type="image"> inside <form action> as native submits | `vitest run lib/origin-signing/hydrated-submit-guard.test.ts --reporter=dot -t "native submits"` | FAIL — `expected [] to deeply equal [ …(2) ]` · Tests 1 failed \| 6 skipped (7) | 2026-11-10T17:48:38Z |
| GREEN (M4) | ídem | ídem | PASS — Tests 1 passed \| 6 skipped (7) | 2026-11-10T17:49:59Z |
| TRIANGULATE (M4) + timeout | `<Input type="image">` marcado; `<input type="submit">` en `<form onSubmit>` no; escaneo real de app/ y components/ con timeout 30 s | `vitest run lib/origin-signing/hydrated-submit-guard.test.ts --reporter=dot` | PASS — Tests 8 passed (8) | 2026-11-10T17:51:07Z |
| REFACTOR | fake `failingSubtle` compartido en el test del interceptor | `vitest run lib/origin-signing/content-hash-fetch.test.ts lib/origin-signing/hydrated-submit-guard.test.ts --reporter=dot` | PASS — Tests 37 passed (37) | 2026-11-10T17:52:30Z |

Checks locales: lint ✔ (`pnpm lint` → `Tasks: 5 successful, 5 total`) · typecheck ✔ (`pnpm typecheck` → `Tasks: 5 successful, 5 total`) · tests ✔ (`pnpm test` → `Tasks: 4 successful, 4 total`; web `Test Files 19 passed (19)`, `Tests 107 passed (107)`; core 286, infra 285, db 20 passed). Log 2026-11-10T18:04:11Z (`WARN=backgrounded`; resultado leído de la salida de la tarea, exit 0).
Commit: ver informe de cierre
Decisiones menores:
- `ContentHashFetchDeps.location` recibe el objeto `location` vivo y se lee en cada llamada: con navegación de cliente la URL del documento cambia después de instalar el interceptor. La comparación de mismo origen sigue siendo por `origin`.
- La guarda también trata `<Input>` (shadcn, que reenvía `type` al `<input>`) igual que `<input>`, en paralelo a `button`/`Button`. Solo `type` literal `submit`/`image`.
- Timeout explícito de 30 s solo en los dos tests que leen de disco (AC-13 y AC-14), con comentario del porqué.
- La línea del log 2026-11-10T17:51:18Z (`exit=!0`, `sin salida capturada`) es una entrada del hook sin resumen para ese mismo comando; la corrida con resumen del runner, que es la que cuenta, es la de 17:52:30Z.
Notas para el verifier: los mutantes viven en el scratchpad de la sesión, fuera del repo. Los TRIANGULATE de M3/M4 pasaron de entrada (guardas de comportamiento correcto por construcción); no se presentan como RED. Fixtures sintéticos (`Persona Prueba`, `V-00000000`).

