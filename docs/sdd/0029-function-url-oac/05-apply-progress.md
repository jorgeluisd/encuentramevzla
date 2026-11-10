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
Commit: ver la sección de T-2 (el hash se anota en el commit siguiente)
Decisiones menores:
- Los casos de TRIANGULATE pasaron de entrada: son guardas de AC que el diseño cumple por construcción (`new Request` para cualquier body, sin estado de módulo, `fetch` fuera del `try`). No se presentan como RED.
- Tipo `ContentHashFetchTarget` mínimo (`fetch`, `location.origin`, `crypto?.subtle`) para que `installContentHashFetch(window)` compile y sea testeable sin DOM.
- Un único comentario de porqué sobre `withContentHash` (bytes firmados = bytes enviados, ADR-0012).
Notas para el verifier: los fixtures son sintéticos (`Persona Prueba`, `V-00000000`); la salida de los RED muestra hashes de esos fixtures, no de datos reales.
