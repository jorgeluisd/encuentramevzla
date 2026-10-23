# 05-apply-progress — 0026-ci-deploy-production

## RESUMEN ACUMULADO
| Tarea | Estado | Commit | AC cubiertos |
|---|---|---|---|
| T-1 | terminada | 729f6f1 | habilita AC-7..18 |
| T-2 | terminada | f831e75 | AC-1, AC-2, AC-3, AC-4, AC-5 |
| T-3 | terminada | 185db6c | AC-6 |
| T-4 | terminada | 2172795 | AC-20, AC-21 (parte script) |
| T-5 | terminada | (ver commit de T-5) | AC-22 (parte script) |

## T-1 — Dependencia `yaml` en infra   estado: terminada
TDD: OFF (config pura: alta de una devDependency, sin código de producción ni test propio; definido así en 04-plan)
Safety net: `pnpm --filter @evzla/infra test` → Test Files 2 passed (2) Tests 28 passed (28) (2026-10-23T02:42:39Z)
Archivos tocados: [infra/package.json, pnpm-lock.yaml]   Desviaciones respecto al plan: ninguna

Verificación de la dependencia (antes de instalar):
- `npm view yaml@2.9.1 time`: publicada 2026-09-11T20:30:10Z (más de 72 h).
- `npm view yaml@2.9.1 scripts`: sin `preinstall`/`install`/`postinstall`/`prepare` (solo scripts de desarrollo/publicación del autor, que no corren al instalar). Sin `dependencies`.
- Instalación: `pnpm --filter @evzla/infra add -D --save-exact yaml@2.9.1`, luego `pnpm install --frozen-lockfile` → "Lockfile is up to date".
- Diff del lockfile: solo +3 líneas (importer `infra` → `yaml: specifier 2.9.1, version 2.9.1`); `yaml@2.9.1` ya existía como transitiva de vite, ninguna otra versión cambió.

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
| RED | — (TDD OFF) | — | — | — |
| GREEN | suite completa | `pnpm test` | PASS: `@evzla/infra:test: Test Files 2 passed (2) Tests 28 passed (28)`, web 61 passed | 2026-10-23T02:45:10Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (core 286, db 20, web 61, infra 28)

Commit: 729f6f1 chore(deps): add yaml 2.9.1 as infra dev dependency
Decisiones menores: ninguna.
Notas para el verifier:
- La línea del log 2026-10-23T02:42:07Z (`exit=!0 · sin salida capturada · WARN=resultado-inferido-por-ausencia-de-PostToolUse`) corresponde al arranque de la misma corrida del safety net; su resultado real es la línea 02:42:39Z (exit=0, 28 passed). No hubo ninguna corrida roja.
- `gates.md`, `02-spec.md` y `04-plan.md` aparecen modificados en el árbol por el orquestador; no forman parte de este commit.

## T-2 — EvzlaCiStack (rol OIDC de despliegue)   estado: terminada
TDD: ON (infra, test de síntesis CDK con `aws-cdk-lib/assertions`)
Safety net: N/A (solo archivos nuevos: `infra/lib/ci-stack.ts`, `infra/test/ci-stack.test.ts`)
Archivos tocados: [infra/lib/ci-stack.ts, infra/test/ci-stack.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (el apply-progress va en el mismo commit por pedido del orquestador)

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | creates exactly one role evzla-github-deploy… (AC-1) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | FAIL: "Expected 1 resources of type AWS::IAM::Role but found 0" · `Tests 1 failed (1)` | 2026-10-23T02:48:30Z |
| GREEN | creates exactly one role… (AC-1) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | PASS · `Tests 1 passed (1)` | 2026-10-23T02:48:50Z |
| RED | trusts only the GitHub OIDC provider… (AC-2) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "trusts only"` | FAIL: trust con `sts:AssumeRole` y `Principal.AWS` root en vez de `AssumeRoleWithWebIdentity` federado · `Tests 1 failed \| 1 skipped (2)` | 2026-10-23T02:49:12Z |
| GREEN | trusts only… (AC-2) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "trusts only"` | PASS · `Tests 1 passed \| 1 skipped (2)` | 2026-10-23T02:49:30Z |
| RED | allows only sts:AssumeRole on the six cdk bootstrap roles… (AC-4) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "allows only sts"` | FAIL: "expected [] to have a length of 1 but got +0" · `Tests 1 failed \| 2 skipped (3)` | 2026-10-23T02:49:52Z |
| GREEN | allows only sts:AssumeRole… (AC-4) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "allows only sts"` | PASS · `Tests 1 passed \| 2 skipped (3)` | 2026-10-23T02:50:12Z |
| RED (previo, descartado) | outputs only DeployRoleArn and DeployRoleName (AC-5) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "outputs only"` | FAIL por `TypeError: Cannot convert undefined or null to object` (sin `Outputs`); se endureció el test con `?? {}` y se repitió | 2026-10-23T02:50:37Z |
| RED | outputs only DeployRoleArn and DeployRoleName (AC-5) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "outputs only"` | FAIL: "expected [] to deeply equal [ 'DeployRoleArn', 'DeployRoleName' ]" · `Tests 1 failed \| 3 skipped (4)` | 2026-10-23T02:50:50Z |
| GREEN | outputs only… (AC-5) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "outputs only"` | PASS · `Tests 1 passed \| 3 skipped (4)` | 2026-10-23T02:51:05Z |
| TRIANGULATE RED | refuses an account other than the one its literal ARNs belong to | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "refuses an account"` | FAIL: "expected [Function] to throw an error" · `Tests 1 failed \| 5 skipped (6)` | 2026-10-23T02:51:20Z |
| TRIANGULATE GREEN | refuses an account… | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "refuses an account"` | PASS · `Tests 1 passed \| 5 skipped (6)` | 2026-10-23T02:51:32Z |
| GUARDA (sin RED) | imports the OIDC provider by ARN without creating it (AC-3) | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts -t "imports the OIDC provider"` | PASS de entrada · `Tests 1 passed \| 5 skipped (6)` | 2026-10-23T02:51:45Z |
| REFACTOR | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | PASS · `Tests 6 passed (6)` | 2026-10-23T02:52:03Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 34 passed: 6 nuevos + 28 previos; core 286, db 20, web 61) (2026-10-23T02:53:31Z)

Commit: f831e75 feat(infra): add ci stack with github oidc deploy role
Decisiones menores:
- Cuenta fijada como `CI_ACCOUNT = "934106163170"` exportada; los ARN (provider, 6 roles de bootstrap) se construyen con esa constante sin tokens. El constructor rechaza cualquier `env.account` distinto: las ARN literales solo tienen sentido en esa cuenta (T-3 pasará el account del context y fallará temprano si no coincide).
- `BOOTSTRAP_ROLE_ARNS` exportado como `readonly string[]` (orden: deploy, file-publishing, lookup × sa-east-1, us-east-1).
- El GREEN de AC-1 usó temporalmente `AccountRootPrincipal` para que el RED de AC-2 fuera real; el trust definitivo es `WebIdentityPrincipal` con `StringEquals` exacto.
Notas para el verifier:
- AC-3 es una invariante negativa (no crear `AWS::IAM::OIDCProvider`, ni `Custom::*`, ni Lambda): quedó satisfecha por el GREEN de AC-2 (`fromOpenIdConnectProviderArn`), por eso su test pasó de entrada; se registra como guarda, no como par RED→GREEN.
- La línea 02:50:37Z es un RED válido de comportamiento (no hay outputs) pero con `TypeError` en vez de aserción; la fila de referencia es 02:50:50Z.
- Ninguna línea del log de esta tarea (02:48:30Z a 02:53:31Z) tiene `WARN`.

## T-3 — App CDK separada para EvzlaCiStack   estado: terminada
TDD: ON (infra, tests de síntesis CDK + synth real del bin con `tsx`)
Safety net: `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` → Test Files 1 passed (1) Tests 6 passed (6) (2026-10-23T02:56:01Z)
Archivos tocados: [infra/lib/ci-app.ts, infra/bin/evzla-ci.ts, infra/test/ci-stack.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna (el apply-progress va en el mismo commit por pedido del orquestador). `infra/test/evzla-stack.test.ts`, `infra/lib/app.ts`, `infra/bin/evzla.ts` y `infra/cdk.json` sin cambios.

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED (previo, descartado) | 4 tests de `buildCiApp` / bin | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | FAIL · `Tests 4 failed \| 8 passed (12)` · `WARN=compile-error` por `ERR_MODULE_NOT_FOUND` de `bin/evzla-ci.ts` aún inexistente; se repitió con un bin vacío | 2026-10-23T02:57:02Z |
| GREEN (previo) | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | PASS · `Tests 12 passed (12)` | 2026-10-23T02:57:42Z |
| RED | creates only EvzlaCiStack…, fails early without the account context, fails early when the context account is not…, bin/evzla-ci.ts synthesizes EvzlaCiStack as its only stack | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | FAIL (comportamiento ausente: stub `throw "not implemented"` y bin que sintetiza una App vacía → "expected [] to deeply equal [ 'EvzlaCiStack' ]") · `Tests 4 failed \| 8 passed (12)` | 2026-10-23T03:02:07Z |
| GREEN | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-stack.test.ts` | PASS · `Tests 12 passed (12)` | 2026-10-23T03:02:41Z |
| TRIANGULATE | fails early without the account context · fails early when the context account is not the one the stack belongs to | (misma corrida que RED/GREEN) | FAIL en 03:02:07Z → PASS en 03:02:41Z | 2026-10-23T03:02:41Z |
| GUARDA (sin RED) | buildApp does not create EvzlaCiStack · cdk.json keeps bin/evzla.ts as the default app | (misma corrida) | PASS de entrada (invariantes negativas de AC-6) | 2026-10-23T03:02:07Z |
| REFACTOR | — (sin cambios tras el GREEN) | `pnpm test` | PASS · infra `Test Files 3 passed (3)` `Tests 40 passed`, core 286, web 61 | 2026-10-23T03:02:50Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 40 = 34 previos + 6 nuevos; `evzla-stack.test.ts` 22 passed sin tocarlo) (2026-10-23T03:00:14Z y 03:02:50Z)

Commit: 185db6c feat(infra): add separate cdk app for the ci stack
Decisiones menores:
- `buildCiApp` valida el context `account` con el mismo mensaje que `buildApp` (`Falta el context "account"`) y delega en el constructor de `EvzlaCiStack` el rechazo de una cuenta distinta de `CI_ACCOUNT`.
- `bin/evzla-ci.ts` no pasa `baseDir` (el stack de CI no lee `.open-next`).
- El test del bin ejecuta `pnpm exec tsx bin/evzla-ci.ts` con `CDK_OUTDIR` temporal y `CDK_CONTEXT_JSON={"account":…}` (sin CLI de CDK ni credenciales) y lee `manifest.json`: es la prueba directa de que el bin instancia solo `EvzlaCiStack`. Tarda ~15 s, dentro del `testTimeout` de 120 s.
Notas para el verifier:
- La corrida 02:57:02Z falló por las razones correctas en los 3 tests de `buildCiApp`, pero el hook la marcó `WARN=compile-error` por el bin inexistente; no se usa como RED. El RED de referencia es 03:02:07Z (sin WARN): se volvió temporalmente al stub y a un bin `new App().synth()` y se restauró el GREEN idéntico (turbo reutiliza el hash `d686ee35e026da91` en 03:02:50Z).
- AC-6 "`cdk deploy --all` en `infra/` no lo incluye" queda cubierto por los dos tests guarda: `buildApp` no crea `EvzlaCiStack` y `cdk.json#app` sigue apuntando a `bin/evzla.ts`.


## T-4 — Script `resolve-ref.mjs` (ref del dispatch → SHA)   estado: terminada
TDD: ON (script de CI, test con repos git temporales sintéticos ejecutando el `.mjs` con `node` y entradas solo por `env`)
Safety net: N/A en tests (solo archivos nuevos: `infra/scripts/ci/resolve-ref.mjs`, `infra/test/ci-scripts.test.ts`); `pnpm --filter @evzla/infra lint` verde antes de empezar.
Archivos tocados: [infra/scripts/ci/resolve-ref.mjs, infra/test/ci-scripts.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna. `infra/vitest.config.ts` (`include: ["**/*.test.ts"]`) e `infra/eslint.config.mjs` (`eslint .`, solo ignora `cdk.out/**` y `test/fixtures/**`) ya cubren los archivos nuevos sin cambios: el lint marcó `no-undef` sobre `process` en el `.mjs` (prueba de que lo analiza) y se resolvió con `import process from "node:process"`.

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED (previo, descartado) | 4 tests iniciales | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL del `beforeAll` (fixture): `git tag side-tag` → "fatal: no tag message?" por la config global de git del desarrollador · `Tests 4 skipped (4)`; no es RED de comportamiento. Se aisló git con `GIT_CONFIG_GLOBAL=/dev/null` y `GIT_CONFIG_NOSYSTEM=1` | 2026-10-23T03:06:46Z |
| RED | uses GITHUB_SHA when the event is not workflow_dispatch… · uses GITHUB_SHA on workflow_dispatch with an empty ref · accepts a 40-hex SHA that is an ancestor of origin/main · rejects a SHA that is not an ancestor of origin/main | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL (esqueleto `not implemented`, exit 2): "expected 2 to be +0" / "expected 2 to be 1" · `Tests 4 failed (4)` | 2026-10-23T03:07:01Z |
| GREEN | mismos 4 | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 4 passed (4)` | 2026-10-23T03:07:13Z |
| TRIANGULATE RED | resolves an existing annotated tag… · rejects an existing tag whose commit is not an ancestor… · rejects a tag that does not exist · rejects a well-formed 40-hex SHA that is not in the repository | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL: "expected 1 to be +0" (tag rechazado como inválido), "expected 'resolve-ref: ref inválido\n' to contain 'no existe'", "expected 'resolve-ref: el commit no es ancestro…' to contain 'no existe'" · `Tests 4 failed \| 4 passed (8)` | 2026-10-23T03:07:26Z |
| TRIANGULATE GREEN | mismos 4 | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 8 passed (8)` | 2026-10-23T03:07:41Z |
| TRIANGULATE RED | fails closed when GITHUB_SHA is not a 40-hex SHA | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL: "expected +0 to be 1" (escribía `sha=not-a-sha`) · `Tests 1 failed \| 11 passed (12)` | 2026-10-23T03:08:01Z |
| GUARDA (sin RED) | rejects garbage with shell metacharacters / a value starting with '-' / a workflow command injection attempt, without echoing the value | (misma corrida) | PASS de entrada: la regex de tag del diseño (`^[A-Za-z0-9][A-Za-z0-9._/-]*$`) ya los rechazaba; se registran como guardas de AC-20 | 2026-10-23T03:08:01Z |
| TRIANGULATE GREEN | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 12 passed (12)` | 2026-10-23T03:08:20Z |
| REFACTOR | archivo completo (tras `import process from "node:process"`) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 12 passed (12)` | 2026-10-23T03:09:59Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra `Test Files 4 passed (4)` `Tests 52 passed` = 40 previos + 12 nuevos; core 286, db 20, web 61) (2026-10-23T03:12:17Z)

Commit: 2172795 feat(infra): add ci script to resolve the deploy ref
Decisiones menores:
- Contrato del script: entradas `EVENT_NAME`, `INPUT_REF`, `GITHUB_SHA`, `GITHUB_OUTPUT` (solo `env`); salida `sha=<40 hex>` en `GITHUB_OUTPUT` y una línea `resolve-ref: <sha>` en stdout. T-10 debe pasar `EVENT_NAME: ${{ github.event_name }}` e `INPUT_REF: ${{ inputs.ref }}` por `env:`; `GITHUB_SHA`/`GITHUB_OUTPUT` los pone el runner.
- `git` se invoca con `execFileSync` y argumentos en array (sin shell). Un SHA de 40 hex se verifica con `rev-parse --verify <sha>^{commit}`; un tag primero con `show-ref --verify refs/tags/<t>` y luego se pela a su commit (`^{commit}`), así un tag anotado devuelve el SHA del commit, no del objeto tag.
- Los mensajes de error nunca reproducen el valor recibido: evita que un `ref` hostil inyecte comandos de workflow (`::…::`) en el log.
- Fuera del dispatch (o con `ref` vacío), `GITHUB_SHA` también se valida como 40 hex: falla cerrado si el entorno viene mal.
- SHA abreviado o en mayúsculas no son SHA válidos; caen en la rama de tag y fallan con "el tag no existe" (mensaje claro, sin eco).
Notas para el verifier:
- La línea 03:06:46Z es un fallo del fixture (config global de git), no RED; el RED de referencia es 03:07:01Z.
- Ninguna línea del log de esta tarea (03:06:46Z a 03:12:17Z) tiene `WARN`.

## T-5 — Script `check-public-env.mjs` (guarda de `.env.production`)   estado: terminada
TDD: ON (script de CI; test con archivos `.env.production` temporales sintéticos en `tmpdir`, ejecutando el `.mjs` con `node`)
Safety net: `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` → `Test Files 1 passed (1) Tests 12 passed (12)` (2026-10-23T03:14:45Z)
Archivos tocados: [infra/scripts/ci/check-public-env.mjs, infra/test/ci-scripts.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md]   Desviaciones respecto al plan: ninguna. En el test, `runScript` gana un parámetro opcional `args` (default `[]`) para pasar la ruta por argv; los tests de resolve-ref no cambian.

TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | passes with only NEXT_PUBLIC_ keys, comments and blank lines · fails on a key without the NEXT_PUBLIC_ prefix, printing only line number and key | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL (esqueleto `not implemented`, exit 2): "expected 2 to be +0" / "expected 2 to be 1" · `Tests 2 failed \| 12 passed (14)` | 2026-10-23T03:15:06Z |
| GREEN | mismos 2 (aserción del 2º endurecida a stderr exacto antes de implementar) | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 14 passed (14)` | 2026-10-23T03:15:25Z |
| TRIANGULATE RED | fails on a line that is not a KEY=value assignment without echoing its content · fails closed when the file path is missing or unreadable | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | FAIL: "expected 'check-public-env: línea 2: clave synt…' to be 'check-public-env: línea 2: no es una …'" (eco del contenido como clave) y `TypeError [ERR_INVALID_ARG_TYPE]` sin ruta · `Tests 2 failed \| 15 passed (17)` | 2026-10-23T03:15:50Z |
| GUARDA (sin RED) | fails on an exported key without the prefix and reports every offending line (`export FOO=…`) | (misma corrida) | PASS de entrada: el GREEN ya quitaba `export ` y acumulaba violaciones | 2026-10-23T03:15:50Z |
| TRIANGULATE GREEN | archivo completo | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts` | PASS · `Tests 17 passed (17)` | 2026-10-23T03:16:05Z |
| REFACTOR | — (el GREEN de triangulación ya separa `readLines`/`violationOf`; sin cambios posteriores) | `pnpm test` | PASS · infra `Test Files 4 passed (4)` `Tests 57 passed (57)` | 2026-10-23T03:17:37Z |

Checks locales:
- typecheck ✔ `pnpm typecheck` → "Tasks: 5 successful, 5 total"
- lint ✔ `pnpm lint` → "Tasks: 5 successful, 5 total"
- tests ✔ `pnpm test` → "Tasks: 4 successful, 4 total" (infra 57 = 52 previos + 5 nuevos; core 286, db 20, web 61) (2026-10-23T03:17:37Z)

Commit: ver `git log` (subject `feat(infra): add ci script to guard public env keys`)
Decisiones menores:
- Contrato: la ruta del archivo entra por argv (`node infra/scripts/ci/check-public-env.mjs apps/web/.env.production`), tal como lo invoca el job `checks` en 03-design.md; no hay otras entradas. Sin ruta o archivo ilegible → exit 1 con mensaje fijo.
- Una línea cuenta como asignación solo si casa `^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=`; cualquier otra línea no vacía ni comentario falla con "no es una asignación CLAVE=valor" sin imprimir su contenido (un secreto pegado sin `=` no se reproduce como si fuera clave). La clave solo se imprime cuando es un identificador válido.
- Se reportan todas las líneas infractoras (una por línea de stderr, prefijo `check-public-env:`), no solo la primera; stdout queda vacío.
Notas para el verifier:
- Ninguna línea del log de esta tarea (03:14:45Z a 03:17:37Z) tiene `WARN`.
- No se leyó ni se ejecutó el script sobre `apps/web/.env.production` real; eso queda para T-9.
