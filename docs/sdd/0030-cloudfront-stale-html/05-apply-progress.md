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
Commit: bb265dd fix(infra): cap the server cache policy max TTL at 300 seconds
Decisiones menores: comentario del home reescrito sin "cero invocations" (solo texto). Comentario de porqué en `maxTtl` con referencia a ADR-0013.
Notas para el verifier: el hook de guardrails avisó un email no sintético (`no-reply@encuentramevzla.com`) en evzla-stack.test.ts: es preexistente (test de SES), no lo introduce esta tarea.

## T-3 — HtmlInvalidation (AwsCustomResource /*) tras server y assets   estado: terminada
TDD: ON
Safety net: evzla-stack.test.ts y ci-stack.test.ts dentro del safety net común (PASS)
Archivos tocados: [infra/lib/open-next-site.ts, infra/test/evzla-stack.test.ts]   Desviaciones respecto al plan: ninguna (`ci-stack.test.ts` sin diff, AC-7)
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | describe "HTML invalidation on deploy" (AC-1, AC-2, AC-3, AC-4 policy, log group) | pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts -t "HTML invalidation" | FAIL — Tests 5 failed \| 3 passed \| 33 skipped (41); `expected [] to have a length of 1 but got +0` (no existe Custom::AWS). Los 3 que pasan son guardas de no-regresión: ningún BucketDeployment con DistributionId, ningún cloudfront:* sobre "*", server sin cloudfront (S-2). bg-runs/2026-11-11T13-59-18Z-T3-red.log, `WARN=backgrounded` | 2026-11-11T13:59:18Z |
| GREEN (intento 1) | archivo completo | pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts | FAIL — Tests 2 failed \| 39 passed (41): `invalidation handler not found`. Bug del test: la regex del logical id del handler singleton (`AWS[0-9a-f]+`) no admitía el sufijo en mayúsculas (`...22872D164C4C`). Producción sin cambios; se corrigió solo la regex del test. bg-runs/2026-11-11T14-02-53Z-T3-green-attempt1-red.log, `WARN=backgrounded` | 2026-11-11T14:02:53Z |
| GREEN | archivo completo (41 tests, incluye AC-5/AC-6 de T-2) | pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts | PASS — Test Files 1 passed (1) · Tests 41 passed (41). bg-runs/2026-11-11T14-08-44Z-T3-green.log, `WARN=backgrounded` | 2026-11-11T14:08:44Z |
| TRIANGULATE | AC-3 con fixture temporal de otro BUILD_ID (`next-build-2`): Create/Update cambian | incluido en el RED/GREEN | FAIL → PASS | 2026-11-11T13:59:18Z → 2026-11-11T14:08:44Z |
| REFACTOR | — | sin cambios tras GREEN | — | — |
Checks locales: typecheck ✔ · lint ✔ (`pnpm --filter @evzla/infra typecheck`, `pnpm --filter @evzla/infra lint`) · tests ✔
Commit: 27290fe fix(infra): invalidate the CloudFront HTML after each deploy
Decisiones menores: la invalidación vive en un método privado `invalidateHtml`; `deployAssets` devuelve `Construct[]`; `tagCacheInit` se guarda en una variable local. `DependsOn` sale de `node.addDependency(serverFunction, ...assetDeployments, tagCacheInit?)` al final del constructor; CDK además agrega la policy del CR. Plantilla verificada con un synth local (sin AWS): `Create`/`Update` = `createInvalidation` con `CallerReference evzla-fixture-build`, `InstallLatestAwsSdk false`, policy única `cloudfront:CreateInvalidation` sobre `arn:<partition>:cloudfront::<account>:distribution/<Ref>`, handler singleton con `LoggingConfig` → `SiteHtmlInvalidationLogs` (30 días), runtime `nodejs24.x` fuera de la VPC.
Notas para el verifier: el handler singleton de AwsCustomResource corre con el runtime por defecto de CDK 2.272 (`nodejs24.x`), no 22. T-7 (`cdk diff`) lo hace el orquestador.

## T-4 — smoke con build id en las 4 rutas HTML   estado: terminada
TDD: ON
Safety net: ci-scripts.test.ts dentro del safety net común (PASS)
Archivos tocados: [infra/scripts/ci/smoke.mjs, infra/test/ci-scripts.test.ts]   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | describe "smoke.mjs" reescrito: OK (AC-9), lista exacta (AC-11), id distinto ×4 rutas y ausente ×4 (AC-10, S-4), propagación, 18 intentos, archivo BUILD_ID inválido | pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "smoke.mjs" | FAIL — Tests 17 failed \| 7 passed \| 126 skipped (150); p. ej. `expected [ 'GET /', 'GET /admin', …(2) ] to deeply equal [ 'GET /', 'GET /buscar', …(5) ]`, `expected +0 to be 1` | 2026-11-11T13:46:38Z |
| GREEN | mismo describe | pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "smoke.mjs" | PASS — Tests 24 passed \| 126 skipped (150) | 2026-11-11T13:47:44Z |
| TRIANGULATE | payload sin escapar (`{"b":"<id>"}`), id viejo dos veces y luego el nuevo (propagación), bordes del archivo (`a b`, `a"b`, 65 chars, vacío, ausente, sin argumento) | incluidos en el RED/GREEN | FAIL → PASS (el de payload sin escapar pasó ya en el RED porque el script viejo no miraba el id; queda como triangulación de la regex) | 2026-11-11T13:46:38Z → 2026-11-11T13:47:44Z |
| REFACTOR | — | sin cambios tras GREEN | — | — |
Checks locales: typecheck ✔ · lint ✔ (`pnpm --filter @evzla/infra lint && pnpm --filter @evzla/infra typecheck`, exit 0) · tests ✔
Commit: be47deb ci(infra): check the deployed build id in the smoke HTML pages
Decisiones menores: tests existentes del smoke ajustados a la nueva firma (segundo argumento) y a 18 intentos en `/` (diseño: las 4 rutas HTML usan `BUILD_ID_ATTEMPTS`). Mensaje fijo `falta un BUILD_ID válido del build desplegado`. Orden de checks en `/`: título y luego build id. El smoke valida la URL antes que el archivo.
Notas para el verifier: stderr solo imprime ruta, status, intento y motivo fijo; nunca el id servido ni el cuerpo (tests con `OTHER_BUILD_ID` y `BODY_MARKER`).

## T-5 — workflow: smoke con la ruta del BUILD_ID   estado: terminada
TDD: ON
Safety net: ci-workflow.test.ts dentro del safety net común (PASS)
Archivos tocados: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts]   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | constante `SMOKE` con el argumento BUILD_ID + test AC-8 (smoke después de cdk deploy, ningún `run:` con cloudfront) | pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts | FAIL — Tests 2 failed \| 47 passed (49); `expected -1 to be greater than 15` | 2026-11-11T13:54:54Z |
| GREEN | mismos | pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts | PASS — Tests 49 passed (49) | 2026-11-11T13:55:49Z |
| REFACTOR | — | sin cambios tras GREEN | — | — |
Checks locales: typecheck ✔ · lint ✔ (misma corrida que T-4) · tests ✔
Commit: 407bb4e ci(ci): pass the deployed BUILD_ID to the production smoke step
Decisiones menores: ninguna; no se agregan pasos.

## T-6 — verificación   estado: terminada
TDD: OFF (solo comandos, según el plan)
Archivos tocados: ninguno   Desviaciones respecto al plan: ninguna
Resultados (salida literal resumida):
- `pnpm lint` → exit 0 · `Tasks: 5 successful, 5 total`
- `pnpm typecheck` → exit 0 · `Tasks: 5 successful, 5 total`
- `pnpm test` → exit 0 · `Tasks: 4 successful, 4 total` · db `Tests 20 passed (20)` · core `Tests 286 passed (286)` · web `Tests 107 passed (107)` · infra `Test Files 7 passed (7) · Tests 316 passed (316)` (incluye `ci-stack.test.ts` sin diff, AC-7)
- `pnpm build` → exit 0 · `Tasks: 1 successful, 1 total`
- `pnpm --filter @evzla/web build:aws` → exit 0 · `OpenNext build complete.` · genera `apps/web/.open-next/assets/BUILD_ID` (21 bytes, cumple la regex). Imprime `ERROR Could not install dependencies` para `sharp` del image optimizer: OpenNext invoca `npm install --arch/--target` y el npm local los rechaza (`EUNKNOWNCONFIG`). Ajeno a esta feature (no toca la web ni el build); en CI el bundle sale del job de build.
- `pnpm exec cdk synth --ci --quiet` (desde `infra/`, sin AWS) → exit 0 · plantilla con `CallerReference evzla-<BUILD_ID real>` en Create/Update, un único `cloudfront:CreateInvalidation`, `MaxTTL 300` en ServerCachePolicy (el otro `MaxTTL 31536000` es ImageCachePolicy, sin cambios).
- Diff `59b4b63..HEAD`: solo los archivos de T-1..T-5 y este apply-progress.

## T-8 — correcciones de las revisiones (Accept de navegador, /buscar fuera, reintentos, comentarios)   estado: terminada
TDD: ON (comportamiento del smoke). Los dos comentarios de `infra/lib` y los docs no tienen comportamiento: sin ciclo, cubiertos por la corrida final.
Safety net: `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts test/open-next-output.test.ts --reporter=dot` → `Test Files 2 passed (2) Tests 171 passed (171)` (2026-11-11T15:56:00Z) · `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts --reporter=dot` → `Test Files 1 passed (1) · Tests 41 passed (41)`, exit=0 (2026-11-11T15:56:07Z, `WARN=backgrounded`; salida en bg-runs/2026-11-11T15-56-07Z-T8-safety-net-stack.log)
Archivos tocados: [infra/scripts/ci/smoke.mjs, infra/test/ci-scripts.test.ts, infra/lib/open-next-site.ts, infra/lib/open-next-output.ts, docs/sdd/0030-cloudfront-stale-html/02-spec.md, 03-design.md, 04-plan.md, 05-apply-progress.md]   Desviaciones respecto al plan: ninguna
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | describe "smoke.mjs": Accept de navegador en `/`, `/confianza`, `/emergencias`; `/buscar` fuera de `SMOKE_PATHS` y de las peticiones; 5 intentos para 404/503/sin respuesta/título ausente/build id ausente; 18 solo con `build id distinto`; stale → 503 corta en 5 | pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "smoke.mjs" --reporter=dot | FAIL — `Test Files 1 failed (1) Tests 20 failed \| 4 passed \| 126 skipped (150)`; p. ej. `smoke: /buscar 404 intento 1/18` y `sin-respuesta intento 1/18` donde se esperaba `1/5` (comportamiento ausente) | 2026-11-11T15:57:21Z |
| GREEN | mismo describe | pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "smoke.mjs" --reporter=dot | PASS — `Test Files 1 passed (1) Tests 24 passed \| 126 skipped (150)` | 2026-11-11T15:57:59Z |
| TRIANGULATE | `stops after 5 attempts when a stale build id turns into an unexpected status` (presupuesto según el motivo de cada intento) y propagación en `/confianza` (dos stale y luego OK, `n/18`) | incluidos en el RED/GREEN | FAIL → PASS | 2026-11-11T15:57:21Z → 2026-11-11T15:57:59Z |
| REFACTOR | — | sin cambios tras GREEN | — | — |
Checks locales: `pnpm lint` → `Tasks: 5 successful, 5 total`, exit 0 · `pnpm typecheck` → `Tasks: 5 successful, 5 total`, exit 0 (bg-runs/T8-final-lint-typecheck.log) · `pnpm --filter @evzla/infra test` → `Test Files 7 passed (7) · Tests 316 passed (316)`, exit=0 (2026-11-11T16:05:40Z, `WARN=backgrounded`; bg-runs/2026-11-11T16-05-40Z-T8-final-infra-test.log)
Commits: 658fe56 ci(infra): smoke the browser cache variant and retry only stale builds · 386ded3 fix(infra): correct the invalidation and build id comments · docs(sdd) de este registro
Decisiones menores: `Accept` = `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` solo en las rutas con check de build id; las sondas (`/admin`, `/servicios`, 404) siguen sin header. El tope de intentos se decide por el motivo de cada intento: si una ruta pasa de stale a status inesperado, corta cuando el intento llega a 5 (`intento n/5`). `build id ausente` y `título ausente` cortan en 5 (página rota, no propagación). `SMOKE_PATHS = Object.keys(checksFor(""))` se dejó igual (hallazgo bajo, fuera de T-8). El conteo de tests no cambia (316): se quitaron los dos casos de `/buscar` y se agregaron el del `Accept` y el de stale → 503.
Notas para el verifier: `03-design.md` línea 28 (decisión del CallerReference "idempotente en reintentos y en rollback") no se tocó; el porqué corregido vive en el comentario de `open-next-site.ts`. `00-explore.md`/`01-proposal.md` siguen nombrando `/buscar` (artefactos históricos). M-1 no cambia: es en navegador, con su `Accept` real.
