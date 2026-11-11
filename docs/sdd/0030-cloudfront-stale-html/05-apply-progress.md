# 0030 cloudfront-stale-html — apply progress

Safety net común (antes de T-1): `pnpm --filter @evzla/infra test -- test/open-next-output.test.ts test/evzla-stack.test.ts test/ci-scripts.test.ts test/ci-workflow.test.ts test/ci-stack.test.ts` → `Test Files  5 passed (5) · Tests  242 passed (242)` (salida literal del runner, exit 0). La línea del log (2026-11-11T13:22:02Z) quedó `WARN=backgrounded` porque el disco lento movió la llamada a background; el resultado se leyó del archivo de salida de la tarea. No es fila de evidencia RED/GREEN.

## T-1 — BUILD_ID en readOpenNextOutput   estado: terminada
TDD: ON
Safety net: ver arriba (open-next-output.test.ts incluido, PASS)
Archivos tocados: [infra/lib/open-next-output.ts, infra/test/open-next-output.test.ts]   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | describe BUILD_ID (9 casos: lectura, trim, 64 chars, `a b`, `"`, >64, vacío, ausente, symlink fuera) | pnpm --filter @evzla/infra test -- test/open-next-output.test.ts | FAIL — Tests 9 failed \| 12 passed (21); `expected undefined to be 'fixture-build'` (comportamiento ausente) | 2026-11-11T13:23:23Z |
| GREEN | mismos 9 casos | pnpm --filter @evzla/infra test -- test/open-next-output.test.ts | PASS — Tests 21 passed (21) | 2026-11-11T13:23:46Z |
| TRIANGULATE | incluidos en el RED (borde 64/65, vacío, symlink) | — | — | ver RED/GREEN |
| REFACTOR | — | sin cambios tras GREEN | — | 2026-11-11T13:23:46Z |
Checks locales: typecheck ✔ (`pnpm --filter @evzla/infra typecheck`) · lint ✔ (`pnpm --filter @evzla/infra lint`) · tests ✔
Commit: a785a21 feat(infra): read and validate the Next build id from the OpenNext output
Decisiones menores: mensaje fijo `La salida de OpenNext no trae un BUILD_ID válido.` para ausente o inválido; el symlink fuera reusa `confine` con el campo `BUILD_ID`. Los casos de triangulación se escribieron en el mismo RED (todos fallaban por comportamiento ausente).
Notas para el verifier: el RED agrupa 9 casos en una corrida.

> Nota sobre evidencia de `evzla-stack.test.ts`: cada corrida tarda 130-200 s en este disco (import de aws-cdk-lib ~100-150 s) y el harness pasa a background toda llamada de más de 180 s, así que el hook la registra `exit=? · WARN=backgrounded`. No se puede repetir en primer plano. La salida literal completa de cada corrida quedó copiada en `docs/sdd/0030-cloudfront-stale-html/bg-runs/<timestamp-log>-*.log` (local, gitignored por `*.log`); el timestamp del nombre es el de la línea del log.

## T-2 — maxTtl 300 s en ServerCachePolicy + comentario del home   estado: terminada
TDD: ON
Safety net: evzla-stack.test.ts dentro del safety net común (PASS)
Archivos tocados: [infra/lib/open-next-site.ts, infra/test/evzla-stack.test.ts, apps/web/app/page.tsx]   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | caps the shared cache of server responses at 300 s without caching by default (AC-5) | pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts -t "server cache policy" | FAIL — Tests 1 failed \| 1 passed \| 31 skipped (33); `- "MaxTTL": 300 / + "MaxTTL": 31536000` (salida en bg-runs/2026-11-11T13-41-45Z-T2-red.log; línea del log `WARN=backgrounded`) | 2026-11-11T13:41:45Z |
| GREEN | archivo completo (incluye AC-5 y la clave idéntica; tests existentes sin modificar, AC-6) | pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts | PASS — Test Files 1 passed (1) · Tests 33 passed (33) (bg-runs/2026-11-11T13-43-10Z-T2-green.log; `WARN=backgrounded`) | 2026-11-11T13:43:10Z |
| TRIANGULATE | keeps the cache key identical (AC-5, S-3): pasó ya en el RED (es de no-regresión, documenta la clave) | — | PASS en el RED | 2026-11-11T13:41:45Z |
| REFACTOR | — | sin cambios tras GREEN | — | — |
Checks locales: typecheck ✔ (`pnpm --filter @evzla/infra typecheck`) · lint ✔ (`pnpm --filter @evzla/infra lint`, `pnpm --filter @evzla/web lint`) · tests ✔
Commit: (ver abajo)
Decisiones menores: comentario del home reescrito sin "cero invocations" (solo texto). Comentario de porqué en `maxTtl` con referencia a ADR-0013.
Notas para el verifier: el hook de guardrails avisó un email no sintético (`no-reply@encuentramevzla.com`) en evzla-stack.test.ts: es preexistente (test de SES), no lo introduce esta tarea.
