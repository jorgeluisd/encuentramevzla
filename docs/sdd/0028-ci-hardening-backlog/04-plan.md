# 04-plan — 0028 Backlog de hardening del CI

## TAREAS
T-1 · ci · TDD: ON · estricto · cubre: AC-1 · terminado: test de tar con `.open-next//s/x` en rojo y luego verde; los fixtures existentes con directorios `dir/` siguen pasando · archivos: [infra/scripts/ci/check-bundle.mjs, infra/test/ci-scripts.test.ts]

T-2 · ci · TDD: ON · estricto · cubre: AC-2 · terminado: `gunzipSync` con `maxOutputLength` de 512 MiB; test con un gzip que se expande por encima del límite (fixture chico generado en runtime) en rojo y luego verde · archivos: [infra/scripts/ci/check-bundle.mjs, infra/test/ci-scripts.test.ts]

T-3 · ci · TDD: ON · estricto · cubre: AC-3, AC-4 · terminado: test con `c -> .` y `a -> c/../x` en rojo y luego verde; cadena `a -> b -> real` sigue pasando; `.open-next` real empaquetado con tar pasa `--tar-archive` · archivos: [infra/scripts/ci/check-bundle.mjs, infra/test/ci-scripts.test.ts]

T-4 · test · TDD: ON · pragmático · cubre: AC-5 · terminado: helper `importSpecifiers(source)` probado contra un texto con las cuatro formas (rojo con la regex actual) y usado por el guard · archivos: [infra/test/ci-scripts.test.ts]

T-5 · test · TDD: OFF (refactor de tests, quedan en verde) · cubre: AC-6..AC-10 · terminado: ARN literales en `ci-stack.test.ts`; ventana `[\s\S]{0,200}?` en los greps; `rmSync` en `finally`; `isolatedGitEnv` en `infra/test/support/git-env.ts`; test de `id-token` sin la frase histórica; comentario de patrones duplicados; `PAX_NAME_RECORDS` separado del marcador pax · archivos: [infra/test/ci-stack.test.ts, infra/test/repo-hygiene.test.ts, infra/test/ci-scripts.test.ts, infra/test/ci-workflow.test.ts, infra/test/support/git-env.ts, infra/scripts/ci/check-bundle.mjs]

T-6 · docs · TDD: OFF · cubre: AC-11 · terminado: `08-close.md` de 0026 marca B-1..B-12 como cerrados por 0028 · archivos: [docs/sdd/0026-ci-deploy-production/08-close.md]

## VERIFICACIÓN
`pnpm typecheck && pnpm lint && pnpm test` en verde; `check-bundle` sobre el `.open-next` real en los tres modos; el job `checks` del próximo release a `main` lo repite con GNU tar.
