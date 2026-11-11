RESUMEN: PASS (0 checks FAIL; 3 notas/GAPs menores)
sha verificado: aed1b9ded9d9f5758f441a0c4e558b7163f65ffa (feat/0029-function-url-oac, base develop). Alcance: R1 (T-1..T-9).

| # | Check | Resultado | Última línea de salida | Recomendación |
|---|---|---|---|---|
| 1 | Typecheck | PASS | `pnpm typecheck --force` -> `Tasks: 5 successful, 5 total / Cached: 0 cached, 5 total`, EXIT=0 | - |
| 2 | Lint + boundaries | PASS | `pnpm lint --force` -> `Tasks: 5 successful, 5 total / Cached: 0 cached, 5 total` (ejecución real, sin `boundaries/*`) | - |
| 3 | Tests unit+handler | PASS | `turbo run test --force` -> core 286/286, db 20/20, web 98/98 (19 files), infra 285/285; `Cached: 0 cached, 4 total`. Sin `skip/only/todo` en el diff (grep exit 1). Sin timeout en `hydrated-submit-guard.test.ts` (AC-13) | - |
| 4 | Integración | N/A justificado | El diff no toca repos, esquema ni migraciones de BD (solo infra CDK y presentación). Sin DDL. | - |
| 5 | Evidencia TDD | PASS | Ver detalle abajo | - |
| 6 | Alcance | PASS con nota | Todos los archivos del diff están en el plan R1; ninguno de T-11..T-18 (open-next-site.ts deja URLs en NONE; solo `ServerOac`/`ImageOac` no-override + permiso `CloudFrontInvokeViaUrl`) | Ver nota 1 |
| 7 | Criterios de aceptación | PASS | AC-1..AC-4, AC-7, AC-8 cubiertos por descripción en `content-hash-fetch.test.ts`; AC-5/6/9..20, 23, 24 nombrados en tests; AC-21/22/25 son R2/R3 (no aplican); AC-26 = este reporte | - |
| 8 | Migraciones | N/A | Sin migraciones de BD. Cambio de infra aditivo (OAC nuevos y permisos nuevos; URLs siguen `NONE`) | - |
| 9 | Seguridad mecánica | PASS | `pnpm audit --audit-level=high` exit 0 (4 moderate: `qs`, `glob`, vía `@opennextjs/aws`, preexistentes/transitivos). Sin secretos en el diff (grep `sk-`, `eyJ…`, `postgres://` exit 1), sin `.env*` en el diff | Ver GAPs |
| 10 | Invariantes proyecto | PASS | Sin skill local `*-invariants`; se verificó CLAUDE.md §7: sin cambios en `core`/`db`/`sensitive`/RPC; la ruta `/api/revalidate` no loggea ni lee body; interceptor sin console/storage (test estático) | - |
| 11 | Convención de entrega | PASS | 9 commits `type(scope): subject` en inglés, cuerpo corto en español, autor Jorge Diaz, sin trailers de IA (grep `co-authored/claude/generated` exit 1) | - |
| 12 | Configuración faltante | PASS | `typecheck`, `lint`, `test`, `build`, `audit` existen y corrieron. `test:integration`/`boundaries` no se necesitan (lo cubre `import/no-restricted-paths` en lint) | - |

Build (T-9, parte de `pnpm build`): PASS
- `pnpm exec turbo run build --force` -> `Tasks: 1 successful, 1 total / Cached: 0 cached, 1 total / Time: 8m7.156s`, BUILD-EXIT=0 (una primera corrida `pnpm build` salió de caché `FULL TURBO`; se forzó).
- `pnpm --filter @evzla/web build:aws` -> AWS-EXIT=0; `grep -rl "x-amz-content-sha256" apps/web/.open-next/assets/_next/static` -> `.../static/chunks/3c3o9n6s7t91b.js` (el chunk del interceptor está en el artefacto, grep exit 0).

Check 5 detalle (TDD ON: T-1, T-3, T-5, T-6, T-7)
- T-1 `content-hash-fetch.test.ts`: RED 01:59:26/01:59:42/01:59:59/02:00:14/02:00:35/02:00:52/02:01:27 -> GREEN 01:59:34/01:59:50/02:00:06/02:00:19/02:00:42/02:01:02/02:01:39, 22 passed 02:02:06. Los RED "inválidos" declarados (01:59:15, 02:00:26) no se contaron.
- T-3 `use-hydrated.test.ts`: RED 02:12:13 -> GREEN 02:12:23.
- T-5 `hydrated-submit-guard.test.ts`: 02:19:55 (`describe is not defined`, declarado inválido) -> RED 02:20:01 (`Tests 2 failed`) -> GREEN 02:21:16. Líneas `exit=0` con `WARN=no-tests-ran` (tsc/eslint) no se usan como evidencia.
- T-6 `revalidate-request.test.ts`: 02:23:52 `WARN=compile-error` solo cuenta como RED de API y le sigue RED de comportamiento 02:24:02 (`not implemented`) -> GREEN 02:24:09; ciclos 02:24:18->02:24:26 y 02:24:34->02:24:40.
- T-7 `evzla-stack.test.ts`: RED 02:34:28 y 02:37:14 -> GREEN 02:41:09 (31 passed). El test temporal `zz-debug-permissions` (02:39:44) se declara no-evidencia y no está en el diff.
- Todos los timestamps de las tablas existen en el log. Ninguna fila usa líneas `WARN=backgrounded/piped-output/interrupted`.
- Líneas `WARN=backgrounded` (02:28:04, 03:11:19, 03:18:48, 03:47:44, 03:48:49) no se usan. Cuatro líneas finales (04:23:34, 04:23:52) son corridas de mutación en scratchpad (`--root .../scratchpad/mut`), `exit=0`, fuera de cualquier ciclo.
- Ciclos TRIANGULATE que pasaron de entrada están declarados como tales, no como RED.

Harness C1 (T-8, no re-ejecutado por instrucción): evidencia registrada en 05-apply-progress.md: `S1..S6 PASS en chromium, webkit y firefox (18/18) · content-hash C1: PASS · exit 0` (leído del output de la tarea en background; el hook solo registró `WARN=backgrounded` 03:11:19). Vistos `text/plain` y `multipart/form-data`.

GAPS de configuración del proyecto
- `pnpm audit` corre y funciona; los 4 hallazgos moderate (`qs`, `glob`) vienen de `apps/web > @opennextjs/aws` y no los introduce el diff (el diff solo añade `playwright` devDep). No frenan el gate (umbral high).
- No existe skill local `<proyecto>-invariants`; check 10 se hizo contra CLAUDE.md §7.

INCONSISTENCIAS DEL HOOK
- Ninguna (no hay línea `exit≠0` con resumen en verde).

NOTAS PARA EL GATE 2
1. Archivos del diff fuera de la lista literal de T-1..T-9: `adr/0012-function-url-aws-iam-oac.md` (documento de diseño del propio feature) y `docs/sdd/0029-function-url-oac/{.level,00..05,gates}`; no son código. Confirmar que el ADR entra en este PR.
2. `05-apply-progress.md` no tiene sección T-9 y T-8 dice `Commit: ver informe de cierre`. La verificación de T-9 la reproduce este reporte (lint/typecheck/test/build en verde + grep del artefacto).
3. Flakiness conocida: `hydrated-submit-guard.test.ts` (AC-13) hizo timeout a 5000 ms con el disco saturado (apply-progress, 02:49:06 y 02:50:12, exit=1). En esta verificación pasó sin timeout dentro de la suite completa (web 98/98), por lo que no hubo re-run aislado. Riesgo residual: puede fallar bajo carga (considerar `testTimeout` explícito en ese test en otra tarea).
4. `/api/revalidate` pasa a exigir `x-revalidate-token`; `Authorization: Bearer` deja de funcionar (AC-17). Bloqueo de R1 del plan: duda 1 (C5, llamadores externos, p. ej. scripts one-off) debe estar resuelta por el humano antes de aprobar. El token se compara con `!==` (no tiempo constante), igual que antes.
5. T-10 (`cdk diff`) y verificaciones post-deploy (AC-M2, M3, M5) son manuales y quedan pendientes. No se llamó a AWS, no se hizo push.
6. `apps/web/.open-next` generado por `build:aws` está ignorado por git; `git status` no muestra archivos modificados (solo los untracked previos ajenos al feature y `06-code-review.md`/`06-security-review.md`).
7. `pnpm-lock.yaml` trae un cambio de metadato `deprecated` en `@smithy/core` además de `playwright` (declarado en apply-progress).
