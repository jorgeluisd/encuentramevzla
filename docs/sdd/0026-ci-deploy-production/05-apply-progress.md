# 05-apply-progress — 0026-ci-deploy-production

## RESUMEN ACUMULADO
Detalle de T-1 a T-8 archivado en `05-apply-progress-T1-T8.md`.

| Tarea | Estado | Commit | AC cubiertos |
|---|---|---|---|
| T-1 | terminada | 729f6f1 | habilita AC-7..18 |
| T-2 | terminada | f831e75 | AC-1, AC-2, AC-3, AC-4, AC-5 |
| T-3 | terminada | 185db6c | AC-6 |
| T-4 | terminada | 2172795 | AC-20, AC-21 (parte script) |
| T-5 | terminada | f20fdb6 | AC-22 (parte script) |
| T-6 | terminada | 3774382 | AC-14, AC-23 (parte script), AC-13 (validación de entradas del tar, parte script) |
| T-7 | terminada | 84c4344 | AC-26, AC-27, AC-28, AC-29 |
| T-8 | terminada | fd02a41 | AC-34 (parte summary) |
| T-9 | terminada | ff5763f | AC-19, AC-24, AC-25, AC-33, AC-35 |
| T-10 | terminada | c744b6a | AC-7, AC-8 (resolve/checks), AC-9, AC-10, AC-12, AC-17 (timeouts), AC-18, AC-21 (workflow), AC-23 (orden en checks) |
| T-11 | terminada | 9f179b5 + 7d5eedb (corrección v6) | AC-8 (id-token solo en deploy), AC-11, AC-13, AC-14 (repetido en deploy), AC-15, AC-16, AC-17 (concurrency), AC-32 (parte estática), AC-34 |
| T-12 | terminada | b5a0c27 | AC-30 (docs) |
| T-13 | terminada | 9bf0e44 (ADR) + b105bf8 (greps) | AC-30 (greps), AC-31 |
| T-14 | terminada | commit `docs(sdd)` de este registro | barrido: todos |

Commits previos a T-1 en la rama (artefactos del pipeline, no tareas): 001f3c8 (diseño), 9685aa7 (firma de ADR y alcance de Dependabot).

Notas finales para el verifier:
- Cobertura de AC-1..AC-35 por tarea en la tabla; AC-32 solo en su parte estática (la parte dinámica, `sub` real del token y AssumeRole, es el paso manual 5 tras el merge).
- `.github/` y `infra/` concentran el código; el único archivo bajo `apps/` es `apps/web/.env.production` (público, previsto en T-9); nada bajo `packages/`.
- Pasos manuales 1 a 6 de 04-plan.md quedan para el humano; no se llamó a AWS ni se hizo push.
- Las líneas del log con `WARN=repo-cruzado` (T-11) y las corridas encadenadas descartadas están explicadas en cada sección.

## T-9 — Higiene del repo (`.gitignore`, `.env.production` versionado, CODEOWNERS, Dependabot)   estado: terminada
TDD: ON para `infra/test/repo-hygiene.test.ts`; los archivos de config son config pura validada por ese test.
Safety net: `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` → `Test Files 1 passed (1) Tests 57 passed (57)` (2026-10-23T03:44:05Z)
Archivos tocados: [.gitignore, apps/web/.env.production, .github/CODEOWNERS, .github/dependabot.yml, infra/test/repo-hygiene.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (Dependabot sigue AC-19 revisado y DUDA RESUELTA 5, que reemplaza el `weekly` del plan)

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | 15 tests de `repo-hygiene.test.ts` antes de tocar config | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | FAIL (comportamiento ausente): negación ausente en `.gitignore`, `.env.production` ignorado y sin trackear, CODEOWNERS solo `*`, `dependabot.yml` ENOENT · `Tests 9 failed \| 6 passed (15)` | 2026-10-23T03:45:23Z |
| GREEN | mismos 15, con `.gitignore`, CODEOWNERS, `dependabot.yml` y `git add` del `.env.production` existente | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | PASS · `Tests 15 passed (15)` | 2026-10-23T03:45:48Z |
| TRIANGULATE | escaneo de secretos con un archivo temporal no ignorado en `infra/` con la clave de ejemplo documentada de AWS (armada por partes con `printf`) | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts -t "secret scan"` | FAIL esperado: `expected [ 'infra/triangulate-secret.tmp' ] to deeply equal []` (solo la ruta, nunca el match) · `Tests 1 failed \| 14 skipped (15)` | 2026-10-23T03:46:06Z |
| TRIANGULATE | archivo temporal borrado | `rm infra/triangulate-secret.tmp && pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | PASS · `Tests 15 passed (15)` | 2026-10-23T03:46:14Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 112 = 97 previos + 15 nuevos) | 2026-10-23T03:49:00Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 112, core 286, db 20, web 61) (2026-10-23T03:49:00Z)

Commit: ff5763f chore(ci): add repo hygiene guards, codeowners and dependabot
Decisiones menores:
- `apps/web/.env.production` se versionó con `git add` tal cual; el agente nunca lo abrió, imprimió ni editó. El test lo lee en proceso pero solo afirma booleanos y conteos (1 línea no vacía; empieza con `NEXT_PUBLIC_TURNSTILE_SITE_KEY=`) y el exit code de `check-public-env.mjs`; ninguna aserción puede imprimir el valor.
- `git check-ignore --no-index`: evalúa las reglas aunque el archivo esté trackeado (sin `--no-index` un archivo trackeado nunca figura como ignorado).
- Escaneo AC-33 sobre `git ls-files --cached --others --exclude-standard` de `.github/`, `infra/` y el `.env.production` (excluye `node_modules` y `cdk.out`); los patrones se arman por partes como en `check-bundle.mjs` para que el test no se detecte a sí mismo; la falla lista solo rutas.
- Dependabot: grupo único `github-actions` con `patterns: ["*"]`, prefijo `chore(ci)`; npm con `schedule.interval: monthly` (obligatorio en el esquema aunque el límite 0 anule los PRs de versión), grupo `npm-security` con `applies-to: security-updates`, prefijo `chore(deps)`.
- CODEOWNERS: se mantiene `*` y se añaden `/.github/` e `/infra/` a `@jorgeluisd`, con un comentario del porqué.
Notas para el verifier:
- En el RED pasaron 6 tests que son guardas sobre estado previo (los tres `.env*` siguen ignorados, sin negación amplia, contenido de 1 línea y `check-public-env.mjs` en verde sobre el archivo ya existente).
- La corrida 03:46:14Z encadena `rm` antes del runner; el exit code registrado es el de vitest (último comando).
- Ninguna línea del log de esta tarea (03:44:05Z a 03:49:00Z) tiene `WARN`.
- SHA pinning: GitHub exige acciones fijadas por SHA (`sha_pinning_required`). Esta tarea no agrega acciones; los PRs de Dependabot para `github-actions` actualizan SHA y comentario `# vX.Y.Z` cuando el workflow (T-10) los use así.

## T-10 — Workflow `deploy-production.yml`: triggers, permisos, jobs `resolve` y `checks`   estado: terminada
TDD: ON (test estructural con `yaml` sobre el workflow, rojo primero)
Safety net: `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` (escanea `.github/`, que esta tarea toca; `ci-workflow.test.ts` no existía) → `Test Files 1 passed (1) Tests 15 passed (15)` (2026-10-23T03:51:20Z)
Archivos tocados: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna. Sin placeholder del job `deploy` (no hace falta: el workflow es válido con `resolve` y `checks`; T-11 lo agrega).

Acciones fijadas (resueltas con `gh api repos/<r>/releases` y `git/ref/tags/<t>`, tag anotado pelado a su commit; contrastado con `git ls-remote`). Majors según 03-design y el pedido del orquestador; dentro de cada major, la última release estable publicada hace ≥ 72 h (hoy 2026-10-23):
| Acción | Versión | SHA (commit) | Publicada |
|---|---|---|---|
| actions/checkout | v5.1.0 | fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 | 2026-07-20T15:27:58Z |
| pnpm/action-setup | v4.4.0 | fc06bc1257f339d1d5d8b3a19a8cae5388b55320 (objeto tag anotado a15d269c…) | 2026-03-13T10:44:28Z |
| actions/setup-node | v5.0.0 | a0853c24544627f65ddf259abe73b1d18a591444 | 2025-09-04T02:52:29Z |
| actions/upload-artifact | v7.0.2 (mayor vigente) | cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 2026-10-07T10:08:14Z |
| actions/download-artifact | v8.0.2 (mayor vigente; lo usa T-11) | 9000827ccba6bdab643e8b6fd33ac0654aef8333 | 2026-10-07T10:09:51Z |
`upload-artifact` v7.0.2 conserva los inputs del diseño (`name`, `path`, `retention-days`, `if-no-files-found`, `overwrite`); `setup-node` v5.0.0 acepta `node-version` y `cache` (ambas corren en `node24`).

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | 25 tests de `ci-workflow.test.ts` sin el workflow | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | FAIL (comportamiento ausente: el archivo no existe, `on`/`permissions`/jobs `undefined`) · `Tests 16 failed \| 9 passed (25)` | 2026-10-23T03:53:05Z |
| GREEN | mismos 25 con `deploy-production.yml` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | PASS · `Tests 25 passed (25)` | 2026-10-23T03:53:24Z |
| TRIANGULATE | mutación: `actions/setup-node@v5 # v5.0.0` (tag en vez de SHA) | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts -t "pins every action"` | FAIL esperado · `Tests 1 failed \| 24 skipped (25)` | 2026-10-23T03:53:46Z |
| TRIANGULATE | mutación: `check-bundle.mjs` movido después del `tar` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts -t "designed order"` | FAIL esperado (diff muestra el cambio de orden) · `Tests 1 failed \| 24 skipped (25)` | 2026-10-23T03:54:04Z |
| REFACTOR | — (mutaciones revertidas, sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 6 archivos, 137 tests = 112 previos + 25 nuevos) | 2026-10-23T03:55:41Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 137, core 286, db 20, web 61) (2026-10-23T03:55:41Z)

Commit: c744b6a feat(ci): add production workflow resolve and checks jobs
Decisiones menores:
- `resolve` hace checkout de `github.sha` con `fetch-depth: 0` (trae tags y `origin/main`, que `resolve-ref.mjs` necesita para `merge-base --is-ancestor`); el step tiene `id: ref` y el job expone `sha: ${{ steps.ref.outputs.sha }}`. `GITHUB_SHA` y `GITHUB_OUTPUT` los pone el runner; solo `INPUT_REF` y `EVENT_NAME` van por `env:`.
- Condición del tarball y del upload: `github.event_name == 'push' || github.event_name == 'workflow_dispatch'` (misma cadena en ambos; el test la fija y exige que ningún otro paso de `checks` tenga `if`).
- Sin `concurrency` a nivel workflow: el diseño la pone en el job `deploy` (T-11) para no serializar PRs; el test afirma su ausencia a nivel workflow.
- El test, además de lo pedido, fija la lista blanca de acciones del diseño y que ningún `run:` de `resolve`/`checks` contenga `${{` (más estricto que "sin `${{ inputs.* }}`", que aplica a todos los jobs y cubre T-11).
Notas para el verifier:
- En el RED pasaron 9 tests: son guardas negativas o cuantificadas sobre el conjunto vacío (sin `pull_request_target`, sin `secrets.`, sin concurrency global, sin acciones fuera de lista, sin `${{ inputs.` en `run:`, timeouts de todos los jobs, sin `${{` en `run:` de resolve/checks).
- Triangulación de la guarda de inyección (`${{ inputs.ref }}` dentro de `run:`): no se ejecutó; el clasificador de permisos bloqueó escribir esa mutación en el workflow, aunque fuera temporal. Se triangularon el pin por SHA y el orden de pasos.
- Majors más nuevas existen (checkout v7, setup-node v7, pnpm/action-setup v6): se respetaron las del diseño (checkout v5, setup-node v5, pnpm v4); Dependabot (mensual, agrupado) propondrá los saltos.
- Ninguna línea del log de esta tarea (03:51:20Z a 03:55:41Z) tiene `WARN`.

## T-11 — Workflow: job `deploy`   estado: terminada
TDD: ON (test estructural con `yaml` sobre el workflow, rojo primero)
Safety net: `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` → `Test Files 1 passed (1) Tests 25 passed (25)` (2026-10-23T03:58:44Z)
Archivos tocados: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md, docs/sdd/0026-ci-deploy-production/05-apply-progress-T1-T8.md (rotación)]   Desviaciones respecto al plan: ninguna

Acción nueva (resuelta con `gh api repos/aws-actions/configure-aws-credentials/releases` y `git/ref/tags/v5.1.1`, ref de tipo `commit`, contrastado con `git ls-remote`):
| Acción | Versión | SHA (commit) | Publicada |
|---|---|---|---|
| aws-actions/configure-aws-credentials | v5.1.1 (última estable de la v5) | 61815dcd50bd041e203e49132bacad1fd04d2708 | 2025-11-24T18:36:44Z |
`download-artifact` reutiliza el pin de T-10 (v8.0.2, `9000827c…`); checkout, pnpm/action-setup y setup-node reutilizan los de `checks`.

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | 15 tests nuevos/ampliados: deploy en runner arm con timeout, id-token solo en deploy, guarda de inputs sobre workflow sintético (stub que devuelve `[]`), y los 12 del `describe("deploy job")` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | FAIL (comportamiento ausente: job `deploy` inexistente; la guarda no marca `build#1`, `build#3`) · `Tests 15 failed \| 28 passed (43)` | 2026-10-23T04:00:35Z |
| GREEN | mismos 43, con el job `deploy` y la guarda real (regex de T-10 `\$\{\{\s*inputs\.`) | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | PASS · `Tests 43 passed (43)` | 2026-10-23T04:00:44Z |
| TRIANGULATE RED | el workflow sintético suma `${{ github.event.inputs.ref }}` y `${{ format('{0}', inputs.ref) }}` en `run:`, más `inputs.ref` en `with:` (no debe marcarse) | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts -t "inputs guard"` | FAIL: "expected [ 'build#1', 'build#3' ] to deeply equal [ Array(4) ]": la guarda de T-10 no veía `github.event.inputs.*` ni `inputs` dentro de una función · `Tests 1 failed \| 42 skipped (43)` | 2026-10-23T04:00:54Z |
| TRIANGULATE RED | regex `[^}]*\binputs\.` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | FAIL: falta `ship#2` (el `}` de `'{0}'` corta `[^}]*`) · `Tests 1 failed \| 42 passed (43)` | 2026-10-23T04:01:06Z |
| TRIANGULATE GREEN | regex `/\$\{\{(?:(?!\}\}).)*\binputs\./s` (hasta el `}}` de cierre) | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | PASS · `Tests 43 passed (43)` | 2026-10-23T04:01:17Z |
| TRIANGULATE | mutación temporal del workflow: `cdk synth` movido después de `configure-aws-credentials` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts -t "deploy job"` | FAIL esperado: orden, "expected 10 to be less than 9" y "synth no debe correr con credenciales" · `Tests 3 failed \| 12 passed \| 28 skipped (43)` | 2026-10-23T04:01:30Z |
| REFACTOR | — (mutación revertida desde copia; sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 6 archivos, 155 tests = 137 previos + 18 nuevos) | 2026-10-23T04:03:17Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 155, core 286, db 20, web 61) (2026-10-23T04:03:17Z)

Commit: 9f179b5 feat(ci): add production workflow deploy job
Decisiones menores:
- Contratos de los scripts (notas de T-6/T-7/T-8): `tar -tzf … > "$RUNNER_TEMP/open-next.entries"` y luego `check-bundle.mjs --tar-entries "$RUNNER_TEMP/open-next.entries"` (antes de extraer); `tar -xzf … --no-same-owner -C apps/web`; `check-bundle.mjs apps/web/.open-next` (después, y antes de credenciales); `write-summary.mjs infra/cdk-outputs.json` con `DEPLOY_SHA: ${{ needs.resolve.outputs.sha }}` por `env:`; `smoke.mjs https://encuentramevzla.com`.
- Listado y validación del tar en dos pasos separados: si `tar -t` falla, el paso cae antes que la validación, sin depender de `pipefail`.
- `download-artifact` solo con `name` y `path` (`${{ runner.temp }}/artifact`): sin `run-id`, `github-token`, `pattern` ni `merge-multiple`; el test lo fija con `toEqual`.
- `configure-aws-credentials` con `role-to-assume` literal, `aws-region: sa-east-1`, `role-session-name: evzla-deploy-${{ github.run_id }}`, `role-duration-seconds: 3600` (03-design paso 8); `toEqual` garantiza que no hay access keys. Tras ese paso solo quedan `run:` (ningún `uses:`), y ninguno tiene `pnpm install`, `tsx`, `esbuild` ni `cdk synth`.
- `cdk synth --ci --quiet` y `cdk deploy … --app cdk.out` con `working-directory: infra`; el test rechaza `--exclusively`, `--all`, `EvzlaCiStack` y `evzla-ci` en el job.
- La guarda "sin `${{ inputs.* }}` en `run:`" se extrajo a `runScriptsInterpolatingInputs(workflow)` y se aplica igual al workflow real (`[]`) y a uno sintético armado en el test; el workflow real no se editó para esto. La de "ningún `${{` en `run:`" ahora cubre también `deploy`.
- AC-34: el test rechaza `set -x`/`set -o xtrace` y `cat … cdk-outputs` en todo el archivo, y `run:` que empiece por `env` o `printenv`.
Notas para el verifier:
- Todas las líneas de esta tarea (03:58:44Z a 04:03:17Z) llevan `WARN=repo-cruzado` porque los comandos se lanzaron con `cd <repo> &&` desde la sesión; el repo y la rama (`wt=`/`branch=`) son estos.
- 03:59:55Z (RED) y 04:00:14Z (GREEN) quedaron encadenadas a la escritura de archivos (heredoc/`python3`): no son evidencia. El RED se volvió a grabar en primer plano a las 04:00:35Z restaurando temporalmente el workflow de HEAD y el stub de la guarda (copias en el scratchpad); el GREEN, a las 04:00:44Z, con los archivos finales restaurados desde esas copias.
- En el RED pasan 28 tests: los de T-10 (resolve/checks) y la guarda sobre el workflow real, que con el stub devuelve `[]` de forma trivial; por eso existe el test sintético.
- `configure-aws-credentials` v5.1.1 corría en `node20`; resuelto en la corrección de abajo (v6.3.0, `node24`).
- El `if` del job es el de 03-design (`github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`): cubre push a main y dispatch desde main y excluye `pull_request`.

### T-11 · corrección — `configure-aws-credentials` a v6.3.0 (decisión del orquestador)
Motivo: la v5.1.1 corre en `node20` (deprecado en los runners); la v6 es la primera mayor en `node24`. El orquestador revisó el changelog: el único cambio incompatible de la v6 es el paso a `node24` y los inputs usados no cambian (contrastado además en el `action.yml` del SHA: `role-to-assume`, `aws-region`, `role-session-name`, `role-duration-seconds` existen; `using: node24`).
| Acción | Versión | SHA (commit) | Publicada |
|---|---|---|---|
| aws-actions/configure-aws-credentials | v6.3.0 (reemplaza v5.1.1) | e1253824e5c10ff9df46874f81ed3ec929e19cfd (tag liviano, `git ls-remote`) | 2026-09-15T05:13:09Z |
Archivos tocados: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones: ninguna

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | pins configure-aws-credentials to major 6 or later, which runs on node24 (mayor derivada del comentario `# vX.Y.Z` del pin, mínimo `MIN_CREDENTIALS_MAJOR = 6`) | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts -t "major 6"` | FAIL (comportamiento ausente): "expected 5 to be greater than or equal to 6" · `Tests 1 failed \| 43 skipped (44)` | 2026-10-23T04:06:33Z |
| GREEN (fallido) | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | FAIL: la edición previa con `sed -i ''` no aplicó (el `sed` del entorno es GNU) y el pin seguía en v5 · `Tests 1 failed \| 43 passed (44)` | 2026-10-23T04:06:43Z |
| GREEN | archivo completo, pin `e1253824… # v6.3.0` | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | PASS · `Tests 44 passed (44)` | 2026-10-23T04:06:54Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 156 = 155 + 1) | 2026-10-23T04:08:42Z |

Checks locales: typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total" · lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total" · tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 156, core 286, db 20, web 61)
Commit: 7d5eedb fix(ci): pin configure-aws-credentials to v6 on node24
Decisiones menores: ningún test fijaba el SHA ni la versión de esta acción (solo el formato `@<40 hex> # vX.Y.Z`), así que no hubo tests que ajustar; el test nuevo lee la mayor de todos los pins de la acción con `matchAll` y exige al menos uno.
Notas para el verifier: líneas 04:06:33Z a 04:08:42Z con `WARN=repo-cruzado` (mismo motivo que arriba); ninguna otra marca.

## T-12 — Documentación del deploy (ARCHITECTURE § 11, README, skill db-prod-scripts)   estado: terminada
TDD: OFF (documentación; el grep de AC-30 lo agrega T-13)
Safety net: `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` → PASS · `Test Files 1 passed (1) Tests 15 passed (15)` (2026-10-23T04:10:08Z)
Archivos tocados: [docs/ARCHITECTURE.md, README.md, .claude/skills/db-prod-scripts.md, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (05-apply-progress.md es el registro de la tarea)
TDD Cycle Evidence: no aplica (TDD OFF).
Checks locales: typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total" · lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total" · tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 156, core 286, db 20, web 61) (2026-10-23T04:11:03Z)
Commit: b5a0c27 docs(deploy): document production ci/cd flow and migration order
Decisiones menores:
- `docs/ARCHITECTURE.md`: sección `## 11. Deploy` (ancla `#11-deploy`) tras `## 10`, con subsecciones Flujo (diagrama mermaid, como el resto del documento), Rol OIDC y sus límites, Rollback, Migraciones → app y Riesgo residual aceptado. Todo contrastado con `deploy-production.yml`, `infra/lib/ci-stack.ts`, `resolve-ref.mjs` y `smoke.mjs` de HEAD.
- `cdk deploy EvzlaStack` sin `--exclusively` despliega también sus dependencias (`EvzlaEmailStack` y, con dominio propio, `EvzlaCertificateStack`); el texto lo dice como "más las stacks de las que depende".
- `README.md`: sección corta `## Deploy` después de "Cómo levantar", con el comando de `EvzlaCiStack` y el enlace a `docs/ARCHITECTURE.md#11-deploy`.
- Skill: bloque "Regla de orden: migraciones → merge → deploy automático" justo después de la introducción, antes de "Regla de oro", con la frase de AC-30 ("Migración antes del merge" y "Nunca contract en el mismo PR que la app").
Notas para el verifier:
- `pnpm typecheck`, `pnpm lint` y `pnpm test` salieron de la caché de turbo (los docs no son inputs de ninguna tarea): el resultado es el del árbol de HEAD más estos tres archivos de texto.
- ADR-0011 y `.github/pull_request_template.md` sin tocar (T-13 y AC-30).

## T-13 — Greps de higiene de AC-30/AC-31 y ADR-0011 a ACEPTADO   estado: terminada
TDD: ON (solo para los greps de higiene; el ADR es documentación)
Safety net: `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` → PASS · `Test Files 1 passed (1) Tests 15 passed (15)` (2026-10-23T04:13:20Z)
Archivos tocados: [infra/test/repo-hygiene.test.ts, adr/0011-ci-cd-github-actions-oidc.md, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (05-apply-progress.md es el registro de la tarea)
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | `ADR-0011 (AC-31)`: estado ACEPTADO con fecha y registro en gates.md; separación build/deploy; sin bootstrap propio; configure-aws-credentials v6; Environment `Production` como requisito manual; cuenta AWS propia como mitigación futura | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | FAIL (comportamiento ausente: el ADR seguía PROPUESTO y no describía esos puntos) · `Tests 7 failed \| 29 passed (36)` | 2026-10-23T04:13:45Z |
| GREEN (parcial) | mismo archivo, ADR enmendado | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | FAIL: el corte de línea del markdown separaba `checks` de "sin credenciales" y `configure-aws-credentials` de `v6` · `Tests 2 failed \| 34 passed (36)` | 2026-10-23T04:14:09Z |
| GREEN | mismo archivo, puntos 2 y 3 del ADR re-envueltos | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | PASS · `Tests 36 passed (36)` | 2026-10-23T04:14:26Z |
| TRIANGULATE | `reads only § 11 and yields nothing for a missing heading, so the greps fail closed` (el extractor de sección no puede volver vacuo un grep) | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts` | PASS · `Tests 37 passed (37)` | 2026-10-23T04:15:05Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 178 = 156 + 22 nuevos) | 2026-10-23T04:16:34Z |

Checks locales: typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total" (exit=0) · lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total" (exit=0) · tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 178, core 286, db 20, web 61) (2026-10-23T04:16:34Z)
Commit: 9bf0e44 docs(adr): accept adr-0011 and align it with the implemented pipeline · b105bf8 test(ci): add hygiene greps for deploy docs and adr-0011
Decisiones menores:
- Dos commits por scope distinto: primero el ADR (`docs(adr)`), después los tests y este registro (`test(ci)`), para que cada commit quede verde.
- Los greps de AC-30 (13 tests) pasaron desde el primer corrido porque T-12 ya había escrito los docs: son guardas de regresión, no RED. El RED de la tarea lo aportan los 7 tests de AC-31.
- `.github/pull_request_template.md` "no cambia" se fija como ausencia de contenido del pipeline (`deploy-production`, `EvzlaCiStack`, `workflow_dispatch`, `OIDC`); comparar contra `main` no es fiable en un checkout superficial del CI.
- ADR enmendado sin cambiar la decisión: punto nuevo "Build y deploy separados" (checks sin credenciales, artifact del mismo run, `cdk synth` antes de credenciales, configure-aws-credentials v6/node24); bootstrap `hnb659fds` existente sin bootstrap propio; Environment `Production` como requisito manual; la mitigación futura pasa de "bootstrap propio" a "cuenta AWS propia en Organizations" (lo registrado en gates.md y en la tabla de amenazas de 03-design) y el bootstrap propio queda en Alternativas como fuera de alcance; "checks en cada PR y push".
Notas para el verifier:
- 04:14:44Z (`-t "AC-30"`, 13 passed) no es una triangulación: el intento de mutar temporalmente ARCHITECTURE/README/plantilla para ver fallar los greps de AC-30 fue denegado por el clasificador de permisos y no se aplicó (`git status` limpio en esos archivos). En su lugar está el test del extractor (04:15:05Z).


## T-14 — Barrido final   estado: terminada
TDD: OFF (verificación: no hay código nuevo)
Safety net: la propia suite completa de abajo (cubre todos los archivos de la rama).
Archivos tocados: [docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (el plan prevé `[]`; este registro es el artefacto de la tarea)

Checks (todos en primer plano salvo el build, en background con espera hasta su exit; turbo con `--force` para no reusar caché; sin pipes sobre la salida):
- `pnpm install --frozen-lockfile` → "Lockfile is up to date, resolution step is skipped" · "Already up to date" (exit 0)
- `pnpm typecheck --force` → "Tasks: 5 successful, 5 total" · "Cached: 0 cached, 5 total" (exit 0)
- `pnpm lint --force` → "Tasks: 5 successful, 5 total" · "Cached: 0 cached, 5 total" (exit 0)
- `pnpm run test --force` → "Tasks: 4 successful, 4 total" · "Cached: 0 cached, 4 total" (infra 178, core 286, db 20, web 61) · log 2026-10-23T04:21:51Z exit=0. La línea previa 04:20:56Z (`pnpm test --force`, exit=1, `WARN=no-tests-ran`) es un error de opción de pnpm ("Unknown option: 'force'"), no corrió ningún test.
- `pnpm run build --force` → "Tasks: 1 successful, 1 total" · "Time: 3m59.026s" (exit 0; solo `@evzla/web` define `build`). El build no dejó cambios en el árbol.
- `pnpm audit --audit-level=high` → "No known vulnerabilities found" (exit 0)

Alcance (`git diff --stat develop...HEAD`: 32 archivos, +3157/−1) contra los "archivos" de T-1..T-13:
- Todos los archivos previstos están en el diff y no hay ningún archivo de código fuera de ellos.
- Diferencias, todas justificadas como artefactos del pipeline SDD de esta feature: `docs/sdd/0026-ci-deploy-production/{.level, 00-explore.md, 01-proposal.md, 02-spec.md, 03-design.md, 04-plan.md, gates.md, 05-apply-progress.md, 05-apply-progress-T1-T8.md}`.
- Bajo `apps/` solo `apps/web/.env.production` (T-9); bajo `packages/`, nada. Los no trackeados del árbol (`docs/dictado-por-voz.md`, `docs/plantilla-carga-pacientes-hospital.xlsx`, `packages/db/scripts/*.mjs`, `supabase/.branches/`, `supabase/.temp/`) son previos a la feature y no se commitearon.

Escaneo del diff (3157 líneas añadidas):
- Claves AWS (`AKIA`/`ASIA` + 16), bloques `PRIVATE KEY`, tokens `ghp_`/`github_pat_`/`sk-`/`xox`/`re_`, asignaciones `secret|password|token|api_key` con valor largo: 0 coincidencias.
- Correos: solo `@example.com` sintéticos (`ci-test@`, `no-reply@`, `budget@`). Teléfonos y cédulas venezolanas: 0.
- Datos públicos presentes por diseño: el ID de cuenta AWS y el ARN del rol (DUDA RESUELTA 1) y la site key pública de Turnstile en `apps/web/.env.production` (DUDA RESUELTA 2).
- Commits `develop..HEAD` (17): autor y committer `Jorge Diaz <diazjorgeluis10@gmail.com>` en todos; sin `Co-authored-by`, `Signed-off-by`, "Generated with" ni menciones a Claude/Anthropic.

Commit: (este) docs(sdd): record final sweep for 0026
Notas para el verifier: ninguna línea de esta tarea en el log lleva `WARN` salvo la 04:20:56Z explicada arriba.


## T-15 — Cache, run obsoleto, zip, `name:` y comentario de `id-token`   estado: terminada
TDD: ON (estricto)
Safety net: `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts test/ci-scripts.test.ts` → PASS `Tests 101 passed (101)` (2026-10-23T04:34:49Z)
Archivos tocados: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts, infra/scripts/ci/check-main-tip.mjs, infra/test/ci-scripts.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]
Desviaciones respecto al plan: `infra/scripts/ci/check-main-tip.mjs` (nuevo) e `infra/test/ci-scripts.test.ts` · la lógica del chequeo de run obsoleto vive en un script con test propio, en el estilo de `resolve-ref.mjs`, para no poner lógica en `run:` (autorizado en el encargo de la tarea).
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | `check-main-tip.mjs` (5 tests: punta actual pasa, run obsoleto falla con mensaje fijo sin SHAs, EXPECTED_SHA ausente/inválido, origin inalcanzable) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "check-main-tip"` | FAIL (razón: comportamiento ausente, el script no existe) · `Tests 5 failed \| 57 skipped (62)` | 2026-10-23T04:35:27Z |
| GREEN | ídem | ídem | PASS · `Tests 5 passed \| 57 skipped (62)` | 2026-10-23T04:35:38Z |
| TRIANGULATE | clon superficial `--depth=1` como el checkout del CI: pasa con la punta, falla con el SHA viejo | ídem | PASS · `Tests 7 passed \| 57 skipped (64)` | 2026-10-23T04:35:55Z |
| RED | workflow (8 tests): `name:` en cada paso y sin repetir (3 jobs), orden del deploy con chequeo de punta y de `zip`, paso de run obsoleto solo en `push` con `EXPECTED_SHA` por `env:` entre checkout y credenciales, `setup-node` de deploy sin cache, comentario de `id-token` preciso | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts` | FAIL (razón: comportamiento ausente en el workflow) · `Tests 8 failed \| 43 passed (51)` | 2026-10-23T04:36:18Z |
| GREEN | workflow + scripts | `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts test/ci-scripts.test.ts` | PASS · `Tests 115 passed (115)` | 2026-10-23T04:37:10Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm test` | PASS · `exit=0` (infra 192) | 2026-10-23T04:38:43Z |
Checks locales: typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total" · lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total" · tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 192, core 286, db 20, web 61)
Commit: (este) fix(ci): harden deploy job against shared cache and stale runs
Decisiones menores:
- `setup-node` de deploy queda con `package-manager-cache: false` además de quitar `cache: pnpm`: en v5 (verificado en su `action.yml` al SHA fijado) el cache automático por `packageManager` viene activo por defecto.
- El chequeo de run obsoleto hace `git fetch --no-tags --depth=1 origin refs/heads/main` y compara `FETCH_HEAD` (no `origin/main`: el checkout superficial no garantiza que esa ref remota se actualice). Va justo después del checkout para fallar antes de descargar e instalar; con `if: github.event_name == 'push'` (en `workflow_dispatch` el rollback despliega a propósito un SHA viejo). El mensaje es fijo y no imprime SHAs.
- Chequeo de `zip`: `command -v zip` justo antes del synth.
- El comentario de synth ahora dice que no hay claves STS pero el job tiene `id-token: write` y install/synth podrían pedir un token OIDC (riesgo aceptado que va a GATE 2).
Notas para el verifier:
- El fetch del chequeo corre sin credenciales (`persist-credentials: false`): funciona porque el repo es público. Si el repo pasara a privado, este paso fallaría cerrado.


## T-16 — Symlinks por `realpath` y validación del tar por headers   estado: terminada
TDD: ON (estricto)
Safety net: `pnpm --filter @evzla/infra test -- test/ci-workflow.test.ts test/ci-scripts.test.ts` → PASS `Tests 115 passed (115)` (2026-10-23T04:41:32Z)
Archivos tocados: [infra/scripts/ci/check-bundle.mjs, .github/workflows/deploy-production.yml, infra/test/ci-scripts.test.ts, infra/test/ci-workflow.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]
Desviaciones respecto al plan: el plan pedía listar el tar en modo verboso (`tar -tvzf`) y validar ese texto. En su lugar `--tar-entries` se reemplaza por `--tar-archive`: el script lee los headers del tar (ustar, GNU long name/link y pax `path`/`linkpath`) con `node:zlib`, sin dependencias. El texto de `tar -tv` es ambiguo con nombres que contienen " -> " o " link to ", depende del locale y difiere entre GNU tar y bsdtar. El workflow pierde el paso "List bundle tarball".
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | check-bundle sobre el bundle extraído: symlink que escapa por otro symlink interno, cadena cuyo último salto sale, colgante y ciclo, hardlinks | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "check-bundle"` | FAIL (razón: comportamiento ausente, guarda léxica) · `Tests 4 failed \| 22 passed \| 42 skipped (68)` | 2026-10-23T04:43:05Z |
| GREEN | ídem (`realpathSync.native` + `nlink > 1`) | ídem | PASS · `Tests 26 passed \| 42 skipped (68)` | 2026-10-23T04:43:43Z |
| RED | `--tar-archive`: tipos, hardlinks, destinos de symlink, ruta a través de un symlink, GNU long name/link, pax, tar corrupto/truncado, tar del sistema; orden del workflow | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts test/ci-workflow.test.ts -t "tar"` | FAIL (razón: comportamiento ausente, el modo no existe) · `Tests 19 failed \| 5 passed \| 110 skipped (134)` | 2026-10-23T04:45:14Z |
| GREEN | ídem | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts test/ci-workflow.test.ts` | PASS · `Tests 134 passed (134)` | 2026-10-23T04:46:44Z |
| TRIANGULATE | tar del sistema con nombres largos y con " -> " / " link to ", juzgando el destino real del link | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-workflow.test.ts test/ci-scripts.test.ts` | PASS · `Tests 135 passed (135)` | 2026-10-24T00:43:44Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm typecheck && pnpm lint && pnpm test` | PASS · `exit=0` (infra 212) | 2026-10-24T00:45:25Z |
Checks locales: typecheck ✔ "Tasks: 5 successful, 5 total" · lint ✔ "Tasks: 5 successful, 5 total" · tests ✔ "Tasks: 4 successful, 4 total" (infra 212, core 286, db 20, web 61)
Commit: (este) fix(ci): validate tar headers and real symlink targets in check-bundle
Decisiones menores:
- Las corridas FAIL de 2026-10-23T04:47:03Z y 2026-10-24T00:13:41Z del TRIANGULATE no fueron un RED del script, sino un fixture mal armado: `link("server-functions/evil -> default/index.mjs", "../../outside")` deja el symlink dentro del directorio `evil -> default/`, así que el destino cae en `.open-next/outside`, dentro del bundle. Se corrigió el fixture a `../../../outside`; el script no cambió.
- `realpathSync.native` (libc) en lugar de `realpathSync`: la versión JS normaliza `link/..` de forma léxica antes de seguir el link.
- Los symlinks colgantes o en ciclo se rechazan (fail closed): el bundle real no los trae.
- Se rechaza toda entrada del tar cuya ruta pase por un symlink del mismo tar, aunque apunte adentro: tar la escribiría siguiendo el link.
Notas para el verifier:
- Los tests del tar del sistema corren `tar` local con `COPYFILE_DISABLE=1` (bsdtar en macOS, GNU tar en el runner); los fixtures sintéticos cubren pax y GNU long name/link con independencia del tar instalado.


## T-17 — Helpers compartidos de `scripts/ci`, greps tolerantes y bajas baratas   estado: terminada
TDD: guardas en verde antes y después (refactor pragmático); test nuevo solo donde hay comportamiento nuevo (SHA en mayúsculas) o invariante nuevo (imports de `scripts/ci`).
Safety net: `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts test/ci-workflow.test.ts test/repo-hygiene.test.ts test/ci-stack.test.ts --reporter=dot` → PASS `Tests 184 passed (184)` (2026-10-24T00:47:16Z)
Archivos tocados: [infra/scripts/ci/cli.mjs (nuevo), infra/scripts/ci/check-bundle.mjs, infra/scripts/ci/check-main-tip.mjs, infra/scripts/ci/check-public-env.mjs, infra/scripts/ci/resolve-ref.mjs, infra/scripts/ci/smoke.mjs, infra/scripts/ci/write-summary.mjs, infra/lib/ci-stack.ts, infra/test/ci-scripts.test.ts, infra/test/ci-workflow.test.ts, infra/test/repo-hygiene.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]
Desviaciones respecto al plan: `cli.mjs` exporta `cli(name)`, que devuelve `{ fail, readFileOrFail }` con el prefijo del script, en lugar de un `fail` suelto: cada script escribe `<script>: <mensaje>` y el stderr tenía que quedar idéntico. `fail(...messages)` es la única firma en los 6 scripts.
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | resolve-ref: SHA de 40 hex en mayúsculas → `resolve-ref: el SHA debe ir en minúsculas` (stderr exacto) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "uppercase 40-hex"` | FAIL (razón: comportamiento ausente, cae como tag: `el tag no existe`) · `Tests 1 failed \| 84 skipped (85)` | 2026-10-24T00:48:00Z |
| TRIANGULATE | mayúsculas y mixto (`it.each`) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "40-hex SHA with a message about the case"` | PASS · `Tests 2 passed \| 84 skipped (86)` | 2026-10-24T00:48:22Z |
| GREEN | greps de AC-30 con el doc re-envuelto y sin `**` (mutación temporal de `docs/ARCHITECTURE.md`, revertida con `git checkout`) | `pnpm --filter @evzla/infra test -- test/repo-hygiene.test.ts -t "AC-30" --reporter=dot` | PASS · `Tests 14 passed \| 23 skipped (37)` | 2026-10-24T00:50:32Z |
| RED (mutación) | guarda de imports con `import { parse } from "yaml"` inyectado en `cli.mjs` (revertido) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "scripts/ci imports"` | FAIL (razón esperada: `expected 'yaml' to match /^node:\|^\.\/cli\.mjs$/`) · `Tests 1 failed \| 6 passed \| 86 skipped (93)` | 2026-10-24T00:51:28Z |
| GREEN | guarda de imports (7 scripts) + SHA en mayúsculas | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "scripts/ci imports\|40-hex SHA with a message about the case" --reporter=dot` | PASS · `Tests 9 passed \| 84 skipped (93)` | 2026-10-24T00:53:15Z |
| REFACTOR | archivos tocados tras el refactor de los scripts y de los tests | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts test/ci-workflow.test.ts test/repo-hygiene.test.ts test/ci-stack.test.ts --reporter=dot` | PASS · `Tests 183 passed (183)` (184 − 3 redundantes + 2 nuevos; la guarda de imports se sumó después) | 2026-10-24T00:50:57Z |
Checks locales: typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total" · lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total" · tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 218, core 286, db 20, web 61) (2026-10-24T00:53:02Z)
Commit: (este) refactor(ci): share cli helpers and loosen doc greps
Decisiones menores:
- `readFileOrFail(file, message, parse)`: el `parse` corre dentro del mismo `try`, así `gunzipSync` (check-bundle) y `JSON.parse` (write-summary) fallan con el mismo mensaje que la lectura, como antes.
- SHA en mayúsculas: mensaje específico en vez de normalizar a minúsculas. Normalizar cambiaría lo que se despliega respecto de lo que el humano escribió; el mensaje le dice qué corregir.
- `SMOKE_PATHS = Object.keys(CHECKS)`: una ruta sin chequeo ya no puede existir (antes caía en el `catch` como `sin-respuesta`).
- Guarda de inyección consolidada: queda solo "no expressions inside run scripts" por job (más estricta); se quitaron `runScriptsInterpolatingInputs`, su test sintético y "never interpolates user inputs". También se quitó "sets timeout-minutes on every job" (lo cubre el `it.each` por job, y otro test fija que los jobs son exactamente esos 3).
- Checkouts: `toHaveLength(3)`, uno por job.
- Greps de AC-30/31: `plainProse()` quita `**` y backticks y colapsa espacios; los patrones casan palabras clave dentro de la misma oración (`[^.]*`), con `i` donde la mayúscula es incidental. Se aplica también al README, a la skill `db-prod-scripts` y a la línea de estado del ADR.
- Test nuevo de imports: cada `scripts/ci/*.mjs` importa solo `node:*` o `./cli.mjs` (antes el aislamiento de `resolve` no tenía guarda mecánica).
Notas para el verifier:
- Las corridas de 2026-10-24T00:48:12Z, 00:50:17Z y 00:51:17Z en el log van encadenadas a un `python3` que editó archivos: no son evidencia; se repitieron solas (00:48:22Z, 00:50:57Z, 00:53:15Z). La línea de `pnpm test` de 00:53:02Z tiene `WARN=full-suite-mid-cycle`: es el check local del cierre, no parte del ciclo.
- Bajas de 07-review fuera de T-17 que no se tocaron: patrones AKIA/PEM duplicados (comentario sobre AC-33), `isolatedGitEnv` duplicado, `writeSummary` que reimplementa `runScript` y `expectedArns` espejado en ci-stack.test.ts.
