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
Commit: ver la sección de T-4
Decisiones menores: el GREEN implementa directamente la forma del diseño en vez de una constante `false`, porque la constante rompería AC-11 y el caso cliente no es testeable en el entorno `node` de Vitest.
Notas para el verifier: sin jsdom en el paquete; no se agregó dependencia para probar la rama cliente.
