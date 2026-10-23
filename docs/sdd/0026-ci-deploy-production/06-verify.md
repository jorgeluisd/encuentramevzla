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
