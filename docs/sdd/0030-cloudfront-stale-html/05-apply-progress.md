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
Commit: (pendiente)
Decisiones menores: mensaje fijo `La salida de OpenNext no trae un BUILD_ID válido.` para ausente o inválido; el symlink fuera reusa `confine` con el campo `BUILD_ID`. Los casos de triangulación se escribieron en el mismo RED (todos fallaban por comportamiento ausente).
Notas para el verifier: el RED agrupa 9 casos en una corrida.
