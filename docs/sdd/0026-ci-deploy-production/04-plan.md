# 04-plan — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK)

## RESUMEN
- 14 tareas, un commit por tarea con scope único (`deps`, `infra`, `ci`, `docs`); cada una deja `pnpm typecheck && pnpm lint && pnpm test` en verde.
- Orden: dependencia de test → EvzlaCiStack → scripts `infra/scripts/ci/*.mjs` (uno por tarea) → config de repo (.gitignore, `.env.production`, CODEOWNERS, dependabot) → workflow (checks, luego deploy) → docs/ADR.
- Los scripts van antes del workflow porque el workflow los invoca; `ci-workflow.test.ts` fija las rutas.
- Sin dominio/aplicación/migración/datos personales: solo tooling. Cero cambios en `packages/*`, `apps/*`, `evzla-stack.test.ts`, `cdk.json`, `lib/app.ts`.
- Marcas: sin cross-tenant (no aplica), sin migración, sin PII; seguridad de credenciales en T-2, T-3, T-6, T-10, T-11 (modelo capaz).
- El implementer NO ejecuta ningún paso de la sección "PASOS MANUALES DEL HUMANO" (ni `cdk deploy`, ni `aws`, ni configuración de GitHub).
- Fixtures con patrones de secreto (AKIA…, PEM) se construyen en runtime concatenando partes; nunca literales en el repo.

## TAREAS
T-1 · deps · TDD: OFF (config pura) · pragmático · económico · skills: git-commits · depende de: — · cubre: habilita AC-7..18 · terminado: `yaml` 2.9.1 exacta en devDependencies de `infra`, lockfile actualizado con `pnpm install` (sin cambios de otras versiones), `pnpm typecheck/lint/test` verdes · archivos: [infra/package.json, pnpm-lock.yaml]

T-2 · infra · TDD: ON (test rojo primero) · estricto · capaz · skills: testing-vitest, architecture, privacy-and-security · depende de: — · cubre: AC-1, AC-2, AC-3, AC-4, AC-5 · terminado: `EvzlaCiStack` sintetiza 1 rol `evzla-github-deploy` (MaxSessionDuration 3600, tag project), trust exacto sin StringLike/`*`, provider importado por ARN literal (0 OIDCProvider, 0 custom resource), una sola policy `sts:AssumeRole` con los 6 ARN exactos, outputs solo `DeployRoleArn`/`DeployRoleName`; exporta `GITHUB_SUB`, `BOOTSTRAP_ROLE_ARNS` · archivos: [infra/lib/ci-stack.ts, infra/test/ci-stack.test.ts]

T-3 · infra · TDD: ON · estricto · capaz · skills: testing-vitest, architecture · depende de: T-2 · cubre: AC-6 · terminado: `buildCiApp(app)` crea un único stack (región `CONTRACT.region`, account del context); `bin/evzla-ci.ts` solo lo instancia; test afirma que `buildApp` no contiene `EvzlaCiStack`, que `cdk.json#app` === `pnpm exec tsx bin/evzla.ts` y que `evzla-stack.test.ts` sigue verde sin tocarlo · archivos: [infra/lib/ci-app.ts, infra/bin/evzla-ci.ts, infra/test/ci-stack.test.ts]

T-4 · ci · TDD: ON · estricto · capaz · skills: testing-vitest, privacy-and-security · depende de: T-1 · cubre: AC-20, AC-21 (parte script) · terminado: `resolve-ref.mjs` con repos git temporales: evento ≠ dispatch o ref vacío → `GITHUB_SHA`; SHA 40 hex ancestro de `origin/main` OK; tag existente OK; SHA no ancestro, basura y valor que empieza por `-` fallan con mensaje claro; emite output `sha`; entrada solo por `env` · archivos: [infra/scripts/ci/resolve-ref.mjs, infra/test/ci-scripts.test.ts]

T-5 · ci · TDD: ON · estricto · económico · skills: testing-vitest, privacy-and-security · depende de: T-4 (comparte test file) · cubre: AC-22 · terminado: `check-public-env.mjs` falla con clave sin prefijo `NEXT_PUBLIC_` (incl. `export FOO=1`), imprime solo nº de línea y clave (nunca valor); pasa con solo `NEXT_PUBLIC_*`, comentarios y líneas vacías · archivos: [infra/scripts/ci/check-public-env.mjs, infra/test/ci-scripts.test.ts]

T-6 · ci · TDD: ON · estricto · capaz (seguridad) · skills: testing-vitest, privacy-and-security · depende de: T-5 · cubre: AC-14, AC-23 · terminado: `check-bundle.mjs` falla con dir sin `open-next.output.json`, `.env`/`.env.*`, `*.pem`, `*.key`, contenido con patrón AKIA/aws_secret_access_key/cabecera PEM, symlink fuera de `.open-next` (a `/etc/hostname` y a `../..`); lista solo rutas; symlink interno estilo pnpm pasa · archivos: [infra/scripts/ci/check-bundle.mjs, infra/test/ci-scripts.test.ts]

T-7 · ci · TDD: ON · estricto · económico · skills: testing-vitest, privacy-and-security · depende de: T-6 · cubre: AC-26, AC-27, AC-28, AC-29 · terminado: `smoke.mjs` contra `node:http` local: `/` 200 con `<title>EncuéntrameVzla —`, `/admin` 3xx con Location path `/admin/login` (`redirect: "manual"`), 5 intentos (`SMOKE_RETRY_DELAY_MS` solo tests), fallo imprime `ruta status intento` sin cuerpo y exit 1; URLs en constante exportada con solo `/` y `/admin` · archivos: [infra/scripts/ci/smoke.mjs, infra/test/ci-scripts.test.ts]

T-8 · ci · TDD: ON · estricto · económico · skills: testing-vitest · depende de: T-7 · cubre: AC-34 (parte summary) · terminado: `write-summary.mjs` escribe en `GITHUB_STEP_SUMMARY` solo SHA y `EvzlaStack.CloudFrontDomain` de `cdk-outputs.json`; nunca el resto del archivo · archivos: [infra/scripts/ci/write-summary.mjs, infra/test/ci-scripts.test.ts]

T-9 · ci · TDD: ON para el test de higiene, config pura para los archivos · pragmático · económico · skills: testing-vitest, privacy-and-security, git-commits · depende de: T-5 · cubre: AC-19, AC-24, AC-25, AC-33, AC-35 · terminado: `.gitignore` con `!apps/web/.env.production` justo tras `.env.*` (`git check-ignore` sigue ignorando `.env`, `apps/web/.env.local`, `apps/web/.env`); `apps/web/.env.production` con exactamente `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<valor actual del sitekey, público>` (el implementer lo toma de la config/docs existentes; si no lo encuentra, se detiene y pregunta); CODEOWNERS con `/.github/` e `/infra/`; `dependabot.yml` solo github-actions, `/`, weekly, prefix `chore(ci)`; `repo-hygiene.test.ts` cubre esos AC + escaneo de secretos en `.github/`, `infra/` (excl. node_modules/cdk.out) y `.env.production`; `check-public-env.mjs` pasa sobre el archivo real · archivos: [.gitignore, apps/web/.env.production, .github/CODEOWNERS, .github/dependabot.yml, infra/test/repo-hygiene.test.ts]

T-10 · ci · TDD: ON (test estructural rojo primero) · estricto · capaz · skills: testing-vitest, privacy-and-security · depende de: T-1, T-4, T-5, T-6, T-9 · cubre: AC-7, AC-8, AC-9, AC-10, AC-12, AC-17, AC-18, AC-21 (workflow), AC-23 (orden) · terminado: workflow con `on`, permisos, jobs `resolve` y `checks` (sin id-token ni AWS_*, pasos en el orden de 03-design, tarball+upload solo en push/dispatch, `inputs.ref` solo por `env:`), `timeout-minutes`, `persist-credentials: false`; acciones fijadas por SHA de 40 hex + `# vX.Y.Z` (el implementer resuelve el SHA del último release estable de cada major con `gh api`/git ls-remote; lectura de red permitida, ninguna acción sobre AWS/GitHub config); `ci-workflow.test.ts` verde · archivos: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts]

T-11 · ci · TDD: ON · estricto · capaz (seguridad) · skills: testing-vitest, privacy-and-security · depende de: T-8, T-10 · cubre: AC-11, AC-13, AC-15, AC-16, AC-17, AC-32 (parte estática), AC-34 · terminado: job `deploy` con `needs: [resolve, checks]`, `if` main/no-PR, `environment: Production`, `id-token: write` solo ahí, concurrency a nivel job, descarga sin `run-id`, validación del tar y extracción `--no-same-owner`, check-bundle, install `--filter @evzla/infra...`, `cdk synth` antes de `configure-aws-credentials` (índice credenciales > todo install y synth), `cdk deploy EvzlaStack --app cdk.out …`, write-summary y smoke; sin `build:aws`/`pnpm test|lint|build`, `set -x`, `cat cdk-outputs.json` ni `env`; el test verifica además que ninguna `${{ inputs.* }}` aparece en `run:` · archivos: [.github/workflows/deploy-production.yml, infra/test/ci-workflow.test.ts]

T-12 · docs · TDD: OFF (docs; el grep lo valida T-13) · pragmático · económico · skills: db-prod-scripts, git-commits · depende de: T-3, T-11 · cubre: AC-30 · terminado: `docs/ARCHITECTURE.md` con `## 11. Deploy` (flujo, expand/contract en PR distintos, rollback por dispatch con esquema compatible, deploy manual de EvzlaCiStack, riesgo residual `cfn-exec`); `README.md` con párrafo "Deploy" que enlaza `docs/ARCHITECTURE.md#11-deploy` y el comando de EvzlaCiStack; skill `db-prod-scripts.md` con "migración antes del merge; nunca contract en el mismo PR que la app" · archivos: [docs/ARCHITECTURE.md, README.md, .claude/skills/db-prod-scripts.md]

T-13 · docs · TDD: ON solo para el grep de higiene · pragmático · económico · skills: testing-vitest, git-commits · depende de: T-12 · cubre: AC-30, AC-31 · terminado: `repo-hygiene.test.ts` añade greps de AC-30 y AC-31; `adr/0011-ci-cd-github-actions-oidc.md` pasa a ACEPTADO, documenta separación build/deploy, riesgo residual y futuro cuenta propia, y registra la config de Environment `Production` (reviewer + rama `main`) como requisito manual; `pull_request_template.md` intacto. Nota: el ADR está sin trackear (`??`); se commitea con esta tarea · archivos: [adr/0011-ci-cd-github-actions-oidc.md, infra/test/repo-hygiene.test.ts]

T-14 · test · TDD: OFF (verificación) · estricto · económico · skills: testing-vitest · depende de: T-1..T-13 · cubre: todos (barrido) · terminado: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes en limpio; diff solo contiene los archivos previstos (sin `apps/*`, `packages/*` salvo `apps/web/.env.production`); sin commit propio si no hay cambios (si hay ajuste, scope del archivo tocado) · archivos: []

## MARCAS
- cross-tenant → no aplica (sin datos por tenant) · migración → ninguna (T-2 es CloudFormation, no DDL) · datos personales → ninguna; guardas anti-PII/secretos en T-6, T-7 (solo `/` y `/admin`), T-9.

## PASOS MANUALES DEL HUMANO (tras el merge del PR; el implementer NO los ejecuta)
1. `aws sts get-caller-identity` debe dar la cuenta 934106163170.
2. Desde `infra/`: `pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" diff EvzlaCiStack`, luego `… deploy EvzlaCiStack` (único deploy manual; no requiere `.open-next`). Verificar con `aws iam get-role --role-name evzla-github-deploy` el trust y que no hay otras políticas.
3. Cargar la variable con el ARN del rol (output `DeployRoleArn`) en GitHub si el workflow la consume; hoy el ARN va literal en el workflow (T-11), por lo que solo hay que confirmar que coincide con el output. (Ver DUDA 1.)
4. GitHub, Settings, Environments, `Production`: required reviewer `jorgeluisd` (self-review permitido) y Deployment branches = solo `main`.
5. Primera corrida: el merge a `main` dispara `push` (checks + deploy con aprobación). Aprobar y verificar que el `sub` real coincide (si falla en AssumeRole: sin efecto en prod; corregir el literal, nunca `StringLike`), que el deploy es no-op si el SHA iguala el último manual y que el smoke pasa.
6. Opcional: probar `workflow_dispatch` con `ref` inválido (debe fallar en `resolve`).
Rollback de la feature: `cdk --app "pnpm exec tsx bin/evzla-ci.ts" destroy EvzlaCiStack` y deshabilitar el workflow.

## PARA EL GATE 1
- Ninguna tarea con `TDD: ?`. Confirmar: T-10/T-11 (workflow) con TDD ON vía test estructural en YAML en lugar de OFF; T-9 con TDD ON solo para el test de higiene.

## DUDAS ABIERTAS
1. El diseño pone el ARN del rol literal en el workflow (`arn:aws:iam::934106163170:role/evzla-github-deploy`); la petición menciona "cargar la variable del ARN del rol". Plan: literal (el ARN no es secreto; el test lo fija). Si se prefiere `vars.AWS_DEPLOY_ROLE_ARN`, cambia T-10/T-11 y el paso 3 pasa a obligatorio.
2. Valor de `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (T-9): el implementer debe encontrarlo en el repo; si no está, lo aporta el humano.
3. Resolución de SHAs de acciones (T-10) requiere acceso de red de solo lectura; si no hay, el humano provee los SHAs.
4. `pnpm/action-setup` sin `version` depende de `packageManager` en el `package.json` raíz; verificar que existe (si no, se agrega en T-10 con aviso).

## DUDAS RESUELTAS (orquestador, 2026-10-22)
1. ARN del rol literal en el workflow: OK (no es secreto; el nombre `evzla-github-deploy` es fijo). El paso manual 3 queda como verificación.
2. `apps/web/.env.production` YA EXISTE en local con una sola línea pública, revisada por el humano: T-9 lo versiona tal cual (`git add`), sin regenerarlo.
3. SHAs de las acciones: el implementer los resuelve con `gh api` (lectura).
4. `packageManager: "pnpm@9.15.0"` existe en el `package.json` raíz: `pnpm/action-setup` sin `version` funciona.
