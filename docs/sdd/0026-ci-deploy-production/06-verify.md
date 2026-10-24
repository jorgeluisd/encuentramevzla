# 06-verify — 0026-ci-deploy-production

RESUMEN: PASS (0 checks FAIL; 3 notas para el Gate 2)
sha verificado: c4df4cbaa2d5c60b959da58080c0f1a4436e8782 (rama chore/ci-deploy-production, diff develop...HEAD)

| # | Check | Resultado | Última línea de salida | Recomendación |
|---|---|---|---|---|
| 1 | Typecheck (`pnpm typecheck --force`) | PASS | `Tasks: 5 successful, 5 total` · `Cached: 0 cached, 5 total` · exit 0 | - |
| 2 | Lint + boundaries (`pnpm lint --force`) | PASS | `Tasks: 5 successful, 5 total` · `Cached: 0 cached, 5 total` · exit 0; ningún `boundaries/*` | - |
| 3 | Tests (`pnpm run test --force`, sin pipe) | PASS | core 286, db 20, web 61, infra 178 (6 archivos); `Tasks: 4 successful, 4 total`; sin `skip/only/todo` nuevos (grep sobre el diff de infra/.github: 0) | - |
| 4 | Integración | N/A | el diff no toca repos, esquema, migraciones ni datos; solo tooling (`.github/`, `infra/`, docs) | - |
| 5 | Evidencia TDD | PASS | ver detalle abajo | - |
| 6 | Alcance | PASS | 35 archivos, todos previstos por 04-plan.md (ver abajo) | - |
| 7 | AC -> test | PASS con nota | AC-1..AC-35 cubiertos por tarea; ver nota | - |
| 8 | Migraciones | N/A | sin migración en el diff | - |
| 9 | Seguridad mecánica | PASS | `pnpm audit --audit-level=high` -> `No known vulnerabilities found` (exit 0); ver detalle | - |
| 10 | Invariantes del proyecto | PASS | sin cambios en `packages/*` ni `apps/*` salvo `.env.production`; sin PII, sin exposición del schema `sensitive` | - |
| 11 | Convención de entrega | PASS | 19 commits, todos `tipo(scope): asunto`; 0 trailers `Co-Authored-By`/IA; autor único Jorge Diaz | - |
| 12 | Configuración faltante | PASS | `<typecheck>`, `<lint>`, `<test>`, `<audit>` declarados y corridos | - |

`pnpm install --frozen-lockfile` (insumo del check 1): `Lockfile is up to date, resolution step is skipped` · `Done in 7.9s` · exit 0.

## Check 2: ejecución real
Se forzó con `--force` en turbo: la salida dice `Cached: 0 cached, 5 total`, sin `cached`/`FULL TURBO`. Los paquetes `config` y `db` solo tienen stubs de lint (`echo ... exit 0`) preexistentes; no son parte del diff.

## Check 5: evidencia TDD
- Los 98 timestamps citados en las tablas del apply-progress (y su rotado T1-T8): 90 existen en `tdd-evidence.log`. Los 8 que no figuran son fechas de publicación de releases de acciones (2025-09-04, 2025-11-24, 2026-03-13, 2026-07-20, 2026-09-11, 2026-09-15, 2026-10-07 x2), no referencias al log.
- Para cada tarea TDD: ON hay un `exit=1` anterior a un `exit=0` sobre el mismo archivo de test: ci-stack (02:48:30Z -> 02:48:50Z, y por prueba hasta 02:57:42Z), ci-scripts (03:06:46Z/03:07:01Z -> 03:07:13Z; ... 03:39:32Z -> 03:40:13Z), repo-hygiene (03:45:23Z -> 03:45:48Z; 04:13:45Z -> 04:14:26Z), ci-workflow (03:53:05Z -> 03:53:24Z; 04:00:35Z -> 04:00:44Z).
- WARN en el log (20 líneas):
  - `repo-cruzado` x14 (03:58:44Z a 04:08:42Z, T-11): cuenta, va a NOTAS (el progreso lo explica: comandos con `cd <repo> &&`; `wt=` y `branch=` son este repo y esta rama).
  - `compile-error` x1 (02:57:02Z, `Error: Command failed: pnpm exec tsx bin/evzla-ci.ts`): lo respalda el RED de comportamiento `Tests 4 failed | 8 passed (12)` a las 03:02:07Z y el GREEN 03:02:41Z. No se usó como RED único.
  - `full-suite-mid-cycle` x1 (03:55:41Z): informativo, no es RED ni GREEN referenciado.
  - `resultado-inferido-por-ausencia-de-PostToolUse` x2 (02:42:07Z y 04:31:02Z): no citadas como evidencia; la de 04:31:02Z es de mi corrida de verificación (ver DUDAS).
  - `no-tests-ran` x2 (04:20:56Z, 04:30:29Z): `pnpm test --force` (pnpm no acepta `--force`; fue mi intento y uno del T-14). No cuentan y no están referenciadas.
- Corridas encadenadas a escritura de archivos (03:30:02Z, 03:31:03Z, 03:31:27Z, 03:59:55Z, 04:00:14Z): el apply-progress las declara descartadas; sus REDs/GREENs se re-grabaron en primer plano (03:30:32Z, 03:31:45Z, 04:00:35Z, 04:00:44Z). Ninguna se cita como evidencia válida.
- Líneas `exit!=0` con resumen en verde (patrón "N passed" sin fallo): 0 -> sin inconsistencias del hook.

## Check 6: alcance
Diff `develop...HEAD`: `.claude/skills/db-prod-scripts.md` (T-12), `.github/CODEOWNERS`, `.github/dependabot.yml`, `.gitignore` (T-9), `.github/workflows/deploy-production.yml` (T-10/T-11), `README.md` y `docs/ARCHITECTURE.md` (T-12), `adr/0011-...md` (T-13), `apps/web/.env.production` (T-9, único archivo bajo `apps/*`, previsto en T-14), `infra/bin/evzla-ci.ts`, `infra/lib/ci-app.ts`, `infra/lib/ci-stack.ts` (T-2/T-3), `infra/package.json` + `pnpm-lock.yaml` (T-1), `infra/scripts/ci/*.mjs` x5 (T-4..T-8), `infra/test/{ci-stack,ci-scripts,ci-workflow,repo-hygiene}.test.ts`, y `docs/sdd/0026-*` (artefactos del pipeline). Nada bajo `packages/*`; sin `evzla-stack.test.ts`, `cdk.json` ni `lib/app.ts`.
Archivos sin trackear del árbol de trabajo (`docs/dictado-por-voz.md`, plantillas xlsx, `packages/db/scripts/*`, `supabase/.*`, `07-security.md`) no están en el diff.

## Check 7: AC -> test
Los tests solo nombran literalmente AC-23, AC-30 y AC-31; el resto se traza por descripción de test y por la tabla AC <-> tarea del apply-progress (AC-1..AC-35 mapeados, todos con tarea y test de la misma). AC-32 solo en su parte estática (la dinámica es el paso manual 5 tras el merge, declarado). No se verificó test por test la equivalencia descripción-AC; ver NOTAS.

## Check 9: seguridad mecánica
- Audit: pnpm con lockfile pnpm; sin GAP de lockfile.
- Patrones `sk-`, `eyJ...`, `AKIA...`, `postgres://usuario:` sobre el diff de `.github infra adr docs README.md .claude .gitignore`: 0 coincidencias. El test `repo-hygiene` ("finds no AWS keys or private keys in .github/, infra/ and the public env file") pasó en la corrida.
- `apps/web/.env.production`: único `.env*` del diff, ya declarado y versionado a propósito (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, clave pública). No lo abrí (hook lo prohíbe); lo avala el test de higiene (1 línea, prefijo `NEXT_PUBLIC_`, `check-public-env.mjs` en verde).
- Sin DTOs, sin datos personales en `docs/sdd/` (revisión por patrón, no lectura completa).

## Check 3 (build)
No se corrió `pnpm build` por instrucción; apply-progress T-14 registra `pnpm run build --force` -> `Tasks: 1 successful, 1 total`, `Time: 3m59.026s`, exit 0. Aceptado sin reverificar.

## GAPS de configuración del proyecto
- `<test:integration>`, `boundaries` aparte y `prod_markers`: no aplican a este diff (sin repos/esquema/migraciones). Sin GAP que bloquee.

## INCONSISTENCIAS DEL HOOK
Ninguna.

## NOTAS PARA EL GATE 2
1. `WARN=repo-cruzado` x14 en las filas de T-11 (03:58:44Z a 04:08:42Z): confirmar que el origen es este repo (el `wt=` y `branch=` coinciden).
2. La trazabilidad AC -> test es por descripción para 32 de 35 AC; un humano puede querer un spot-check de AC-8, AC-13, AC-15, AC-16 (permisos/OIDC) en `infra/test/ci-workflow.test.ts`.
3. Riesgo y alcance humano: pasos manuales 1 a 6 de 04-plan.md (Environment `Production`, deploy manual de `EvzlaCiStack`, verificación real del `sub` OIDC) quedan sin ejecutar; no se llamó a AWS ni se hizo push. `apps/web/.env.production` pasa a versionarse (clave pública de Turnstile): confirmar que es la clave de sitio y no el secreto.
4. Pins de acciones: checkout v5, setup-node v5 y pnpm/action-setup v4 son mayores más viejas que las vigentes (decisión de diseño, Dependabot las moverá).

## DUDAS ABIERTAS
- Las líneas 04:20:56Z-04:31:02Z del log (`pnpm test --force`, `pnpm run test --force`) son de la sesión de T-14 y de esta verificación; no afectan la evidencia, pero ensucian el log.
- No pude releer `apps/web/.env.production` ni correr el grep de secretos sobre ese archivo (bloqueado por hook/permisos); se confía en el test de higiene.

## Re-verificación tras T-15..T-17 (2026-10-24)

RESUMEN: FAIL (1 check: #9 audit, externo al diff) · 11 checks PASS/N/A
sha verificado: 3b7cebb2ab261e5fbbe71bd9dfd669e88c0720c7 (diff `930a46f..HEAD`)

| # | Check | Resultado | Última línea de salida |
|---|---|---|---|
| 1 | Typecheck (`pnpm typecheck --force`) | PASS | `Tasks: 5 successful, 5 total` · `Cached: 0 cached, 5 total` · EXIT=0 |
| 2 | Lint + boundaries (`pnpm lint --force`) | PASS | `Tasks: 5 successful, 5 total` · `Cached: 0 cached, 5 total` · EXIT=0; ningún `boundaries/*` |
| 3 | Tests (`pnpm run test --force -- --reporter=dot`) | PASS | core 286, db 20, web 61, infra 218 (6 archivos); `Tasks: 4 successful, 4 total` · EXIT=0; 0 `skip/only/todo` añadidos en el diff |
| 4 | Integración | N/A | el diff no toca repos, esquema ni datos |
| 5 | Evidencia TDD T-15..T-17 | PASS con nota | ver detalle |
| 6 | Alcance | PASS | 12 archivos, todos declarados |
| 7 | AC -> test | PASS | sin AC nuevos; las guardas de AC-30/31 siguen en verde |
| 8 | Migraciones | N/A | sin migración |
| 9 | Seguridad mecánica (`pnpm audit --audit-level=high`) | **FAIL** | `1 vulnerabilities found` · `Severity: 1 high` · EXIT=1 |
| 10 | Invariantes | PASS | sin cambios en `packages/*` ni `apps/*` |
| 11 | Convención de entrega | PASS | 3 commits `fix(ci)`/`fix(ci)`/`refactor(ci)`; 0 trailers IA/Co-Authored-By |
| 12 | Configuración faltante | PASS | typecheck, lint, test, audit declarados y corridos; `pnpm build` no corrido (ver nota) |

### Check 9: FAIL (advisory nuevo, no introducido por el diff)
```
high | body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body
Vulnerable versions >=2.0.0 <2.4.0 · Patched versions >=2.4.0
Paths: apps/web > @opennextjs/aws@4.1.8 > express@5.3.0 > body-parser@2.3.0
https://github.com/advisories/GHSA-27r3-jxmh-p828
```
Archivo/capa: `pnpm-lock.yaml` (transitiva de `@opennextjs/aws` en `apps/web`); `pnpm-lock.yaml` y `apps/web/package.json` NO están en `930a46f..HEAD`. En la primera pasada el audit dio `No known vulnerabilities found`: el advisory apareció después. Regla: audit con `high` = exit 1. Impacto específico: el job `checks` del workflow corre `pnpm audit` y bloquearía el primer deploy desde `main`. Recomendación: `pnpm.overrides` `body-parser@>=2.4.0` (o subir `@opennextjs/aws`) en un commit aparte, fuera de 0026, y re-ejecutar; o aceptación explícita en Gate 2 si el humano prefiere no tocar el lockfile aquí. Sin patrones de secretos (`sk-`, `eyJ…`, `AKIA…`, `postgres://u:p@`) en el diff; ningún `.env*` en el diff.

### Check 5: evidencia TDD
- T-15: safety net 04:34:49Z exit=0; RED `check-main-tip` 04:35:27Z exit=1 (`Tests 5 failed | 57 skipped (62)`) -> GREEN 04:35:38Z; TRIANGULATE 04:35:55Z; RED workflow 04:36:18Z exit=1 (`Tests 8 failed | 43 passed (51)`) -> GREEN 04:37:10Z (`Tests 115 passed (115)`); REFACTOR 04:38:43Z. Todos existen en el log, sin WARN.
- T-16: RED 04:43:05Z exit=1 -> GREEN 04:43:43Z (`check-bundle`, `Tests 26 passed`); RED `tar` 04:45:14Z exit=1 (`Tests 19 failed`) -> GREEN; TRIANGULATE 00:43:44Z exit=0 (`Tests 135 passed (135)`); REFACTOR 00:45:25Z.
- T-17: safety net 00:47:16Z (184 passed); RED 00:48:00Z exit=1 (`Tests 1 failed | 84 skipped (85)`) -> 00:48:22Z; RED de mutación 00:51:28Z exit=1 -> GREEN 00:53:15Z (`Tests 9 passed`); guardas verdes antes (00:47:16Z) y después (00:50:57Z, 183 passed).
- Nota: el GREEN que la tabla de T-16 cita a 04:46:44Z es una llamada encadenada (`python3 - <<EOF … EOF pnpm --filter @evzla/infra test …`, `strict-tdd` §6); no se cuenta como evidencia. Cuenta el GREEN independiente 00:43:44Z sobre los mismos dos archivos (RED 04:45:14Z anterior). Lo mismo para 04:47:03Z (exit=1, encadenada), 00:48:12Z, 00:50:17Z y 00:51:17Z (python3 sin test, declaradas descartadas en el apply-progress). Recomendación editorial: citar 00:43:44Z como GREEN en la tabla de T-16.
- WARN en T-15..T-17: ninguno `repo-cruzado`/`no-tests-ran`/`piped-output`/`interrupted`; `full-suite-mid-cycle` en 00:53:02Z (informativo, no citado como RED/GREEN).
- INCONSISTENCIAS DEL HOOK: ninguna (ninguna línea `exit≠0` con resumen en verde).

### Check 6: alcance `git diff --name-only 930a46f..HEAD`
`.github/workflows/deploy-production.yml`, `infra/lib/ci-stack.ts`, `infra/scripts/ci/{check-bundle,check-main-tip,check-public-env,cli,resolve-ref,smoke,write-summary}.mjs`, `infra/test/{ci-scripts,ci-workflow,repo-hygiene}.test.ts`, `05-apply-progress.md`. Todos en T-15/T-16/T-17; desviaciones declaradas: `check-main-tip.mjs` nuevo (T-15), `--tar-archive` en lugar de `tar -tv` (T-16), `cli(name)` en lugar de `fail` suelto (T-17). Sin archivos sorpresa.

### Hallazgos de la primera pasada asignados a T-15..T-17
| Hallazgo | Estado | Evidencia |
|---|---|---|
| 07-security ALTO: cache de pnpm compartido | RESUELTO | `deploy-production.yml:126` comentario "Sin cache…" + `package-manager-cache: false` (l.131); `cache: pnpm` queda solo en `checks` (l.56); test de workflow verde |
| 07-security BAJO: run obsoleto fuera de orden | RESUELTO | paso `Refuse stale run` (l.107) con `check-main-tip.mjs`; 7 tests |
| 07-security MEDIO: symlinks léxicos / destinos en el tar | RESUELTO | `realpathSync.native` (check-bundle l.205), `nlink > 1` (l.220), `--tar-archive` (workflow l.119); 26+19 tests |
| 07-review: duda `zip` | RESUELTO | paso `Check zip binary` `command -v zip` (l.134) antes de Synth |
| `name:` en todos los pasos | RESUELTO | pasos listados con `- name:`; test por job |
| Comentario de `id-token` | RESUELTO | l.137 describe que install/synth podrían pedir un token (riesgo aceptado) |
| Medios/bajas de 07-review asignadas a T-17 | RESUELTO | `cli.mjs`, `SMOKE_PATHS`, `CONTRACT.region` (ci-stack l.11), SHA en mayúsculas, guarda de imports; las bajas no tocadas están listadas por el implementer |

### GAPS
`pnpm build` no se re-corrió (T-15..T-17 no tocan `apps/web` ni el build; la primera pasada lo aceptó). `<test:integration>`, `boundaries`, `prod_markers`: no aplican.

### NOTAS PARA EL GATE 2
1. Check 9 FAIL externo: decidir override/upgrade de `body-parser` (commit aparte) antes del primer run de `main`, o aceptar el bloqueo conocido del paso `Audit dependencies`.
2. El chequeo de run obsoleto hace `git fetch` sin credenciales: funciona solo mientras el repo sea público (declarado).
3. Riesgo `id-token: write` a nivel de job sigue aceptado explícitamente (comentario l.137).
4. Pasos manuales 1 a 6 de 04-plan.md siguen pendientes.
