# 05-apply-progress — 0026-ci-deploy-production

## RESUMEN ACUMULADO
Detalle de T-1 a T-8 archivado en `05-apply-progress-T1-T8.md`; de T-9 a T-14, en `05-apply-progress-T9-T14.md`.

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
| GREEN | ídem | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-workflow.test.ts test/ci-scripts.test.ts` | PASS · `Tests 135 passed (135)` (la corrida de 2026-10-23T04:46:44Z, 134 passed, fue encadenada a una edición y no cuenta como evidencia) | 2026-10-24T00:43:44Z |
| TRIANGULATE | tar del sistema con nombres largos y con " -> " / " link to ", juzgando el destino real del link | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-workflow.test.ts test/ci-scripts.test.ts` | PASS · `Tests 135 passed (135)` | 2026-10-24T00:43:44Z |
| REFACTOR | — (sin cambios tras el verde) | `pnpm typecheck && pnpm lint && pnpm test` | PASS · `exit=0` (infra 212) | 2026-10-24T00:45:25Z |
Checks locales: typecheck ✔ "Tasks: 5 successful, 5 total" · lint ✔ "Tasks: 5 successful, 5 total" · tests ✔ "Tasks: 4 successful, 4 total" (infra 212, core 286, db 20, web 61)
Commit: (este) fix(ci): validate tar headers and real symlink targets in check-bundle
Decisiones menores:
- Las corridas FAIL de 2026-10-23T04:47:03Z y 2026-10-24T00:13:41Z del TRIANGULATE no fueron un RED del script, sino un fixture mal armado: `link("server-functions/evil -> default/index.mjs", "../../outside")` deja el symlink dentro del directorio `evil -> default/`, así que el destino cae en `.open-next/outside`, dentro del bundle. Se corrigió el fixture a `../../../outside`; el script no cambió.
- `realpathSync.native` (libc) en lugar de `realpathSync`: la versión JS normaliza `link/..` de forma léxica antes de seguir el link.
- Los symlinks colgantes o en ciclo se rechazan (fail closed): el bundle real no los trae.
- Se rechaza toda entrada del tar cuya ruta pase por un symlink del mismo tar, aunque apunte adentro: tar la escribiría siguiendo el link.
- Ruta de descarga de `download-artifact` v8.0.2 (pendiente de 03-design): su README al SHA fijado dice que el artifact se extrae "directly to the specified path", así que `path/<archivo>` sigue valiendo (verificado en la segunda revisión del code-reviewer, 2026-10-24).
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

## T-18 — `check-bundle --tar-archive` falla cerrado ante headers ambiguos y extracción en directorio vacío   estado: terminada
TDD: ON (estricto)
Safety net: `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-scripts.test.ts test/ci-workflow.test.ts` → PASS `Tests 141 passed (141)` (2026-10-24T02:14:20Z)
Archivos tocados: [infra/scripts/ci/check-bundle.mjs, .github/workflows/deploy-production.yml, infra/test/ci-scripts.test.ts, infra/test/ci-workflow.test.ts, docs/sdd/0026-ci-deploy-production/05-apply-progress.md, docs/sdd/0026-ci-deploy-production/05-apply-progress-T9-T14.md]
Desviaciones respecto al plan: `05-apply-progress-T9-T14.md` (nuevo) · rotación del progreso (T-9 a T-14 archivadas; con T-18 y T-19 el archivo vivo pasaba de 10 tareas). El escaneo de la defensa vive en un modo nuevo de `check-bundle` (`--extracted-root`), no en `run:`.
TDD Cycle Evidence
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | `--tar-archive` con fixtures de magic GNU y metadatos en conflicto: prefix con magic GNU (PoC a), magic POSIX con versión distinta de `00` y V7, pax `path` + `L` en los dos órdenes y pax `linkpath` + `K` (PoC c), metadatos repetidos, pax `size` que esconde un miembro (PoC b), pax `hdrcharset`/`GNU.sparse.size`/`path` vacío, datos tras un bloque de ceros aislado. Cada PoC verifica antes con `tar -tzf` del sistema que el miembro sale de `.open-next/` | `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "tar reads differently\|lone zero block"` | FAIL (razón: comportamiento ausente, el parser los acepta) · `Tests 9 failed \| 1 passed \| 93 skipped (103)` | 2026-10-24T02:16:41Z |
| GREEN | ídem + todo check-bundle (incluye los tests con el tar del sistema) | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-scripts.test.ts -t "check-bundle"` | PASS · `Tests 53 passed \| 50 skipped (103)` | 2026-10-24T02:18:42Z |
| RED | `--extracted-root` (solo `.open-next` limpio pasa; archivo, dir, symlink u oculto al lado fallan sin nombrarlos; escaneo de `.open-next`, ausente o symlink; sin argumento o ilegible) y orden del workflow (`mkdir` sin `-p` → `tar -x -C $RUNNER_TEMP/extracted` → `--extracted-root` → `mv -T` → antes de credenciales; un único `tar -x`) | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-scripts.test.ts test/ci-workflow.test.ts -t "extracted-root\|deploy job"` | FAIL (razón: comportamiento ausente, el modo y los pasos no existen) · `Tests 9 failed \| 17 passed \| 132 skipped (158)` | 2026-10-24T02:20:50Z |
| GREEN | ídem | ídem | PASS · `Tests 26 passed \| 132 skipped (158)` | 2026-10-24T02:22:22Z |
| TRIANGULATE | los 3 PoC extraídos con el tar del sistema en un directorio vacío: `--extracted-root` los rechaza sin depender del parser | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-scripts.test.ts -t "the scan of a fresh extraction"` | PASS · `Tests 3 passed \| 110 skipped (113)` | 2026-10-24T02:24:02Z |
| RED | workflow: re-escaneo de `apps/web/.open-next` después del `mv` | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-workflow.test.ts -t "deploy job"` | FAIL (razón: comportamiento ausente, el paso no existe) · `Tests 2 failed \| 17 passed \| 29 skipped (48)` | 2026-10-24T02:28:57Z |
| GREEN / REFACTOR | archivos tocados tras el refactor de los fixtures (`bodyHiding`) y el paso nuevo | `pnpm --filter @evzla/infra test -- --reporter=dot test/ci-workflow.test.ts test/ci-scripts.test.ts` | PASS · `Tests 161 passed (161)` | 2026-10-24T02:29:47Z |
Checks locales: typecheck ✔ `pnpm --filter @evzla/infra typecheck` → `tsc --noEmit` exit 0 · lint ✔ `pnpm --filter @evzla/infra lint` → `eslint .` exit 0 · tests ✔ los dos archivos tocados (161). La suite completa corre al cierre de T-19.
Commit: (este) fix(ci): fail closed on ambiguous tar headers and scan a fresh extraction
Decisiones menores:
- Fail closed en vez de imitar a tar: `prefix` solo con magic POSIX `ustar\0`+`00`; con magic GNU (`ustar  \0`) un prefix no vacío se rechaza (tar lo ignoraría); cualquier otro magic (V7, POSIX con otra versión) se rechaza. El magic se valida en todos los headers, también en los de metadatos.
- Un miembro con pax `path` y `L`, o pax `linkpath` y `K`, se rechaza en cualquier orden; también dos `L`, dos `K` o dos pax para el mismo miembro.
- Registros pax: solo `path` y `linkpath` (no vacíos) se interpretan; `mtime`, `atime`, `ctime`, `uid`, `gid`, `uname`, `gname` y los prefijos `LIBARCHIVE.xattr.` / `SCHILY.xattr.` son inertes (bsdtar de macOS los escribe; el test con el tar del sistema lo cubre). Todo lo demás, `size` incluido, se rechaza.
- Datos no nulos después del primer bloque de ceros → `corrupto o truncado` (`lonezero.tgz`; tar deja de leer ahí, así que no es un escape, pero no se valida lo que no se lee).
- Mensaje nuevo, fijo y sin nombres: `el tar tiene headers que tar podría leer distinto`; `la extracción dejó entradas fuera de .open-next/`.
- Workflow: `mkdir` sin `-p` (el directorio tiene que nacer vacío) y `mv -T` (si `apps/web/.open-next` existiera, falla en vez de anidar). Se mantiene un escaneo de `apps/web/.open-next` después del `mv` ("Scan moved bundle"): un symlink absoluto hacia el temporal pasa el escaneo previo y quedaría colgante.
- El fixture de directorio del test usa modo 0755 (antes 0644): al extraerlo de verdad, 0644 deja un directorio no recorrible.
Notas para el verifier:
- Línea 2026-10-24T02:19:34Z (`exit=!0`, `WARN=resultado-inferido-por-ausencia-de-PostToolUse`): es la misma corrida RED registrada a las 02:20:50Z, no otra.
- Línea 2026-10-24T02:23:10Z (FAIL 3): no fue un RED de comportamiento; las aserciones pasaban y fallaba el `afterEach` (`ENOTEMPTY`) por el fixture de directorio con modo 0644. Se corrigió el fixture, no el script.
- PoC del scratchpad de la revisión: `gnu.tgz`, `oldgnu-prefix.tgz`, `pax-then-L.tgz`, `paxThenL.tgz` y `paxsize.tgz` → `el tar tiene headers que tar podría leer distinto` (exit 1); `lonezero.tgz` → `corrupto o truncado` (exit 1). `lex.tgz` (destino léxico de symlinks, baja al backlog) sigue en exit 0 por el tar, pero lo rechaza el escaneo de la extracción ("symlink colgante o en ciclo"); `ustar.tgz` es el control legítimo (todo dentro de `.open-next/`, exit 0 en `--tar-archive`; extraído, el escaneo falla cerrado porque su directorio viene con modo 0644 y no se puede recorrer).
- GNU tar del runner no se ejecutó localmente (bsdtar 3.7.4 local); los tests de `tar -tzf`/`tar -x` del sistema correrán con GNU tar en el CI.
