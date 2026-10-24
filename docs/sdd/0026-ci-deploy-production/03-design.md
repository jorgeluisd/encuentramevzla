# 03-design — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK, bootstrap `hnb659fds`)

## RESUMEN
- Solo tooling/infra: `infra/`, `.github/`, `.gitignore`, docs. Cero cambios en `@evzla/core`, `@evzla/db`, `sensitive`, RPC, ni en `buildApp`/stacks existentes (bootstrap `hnb659fds` intacto).
- `EvzlaCiStack` (`lib/ci-stack.ts` + `lib/ci-app.ts` + `bin/evzla-ci.ts`): importa el OIDC provider, rol `evzla-github-deploy` con `sub` exacto, solo `sts:AssumeRole` sobre 6 ARN `cdk-hnb659fds-{deploy,file-publishing,lookup}`.
- Workflow `deploy-production.yml`: `resolve` → `checks` (install completo + build OpenNext, sin credenciales) → `deploy` (artifact + install filtrado de infra → credenciales → `cdk deploy`).
- Duda 2 resuelta: `bin/evzla.ts → lib/app.ts` solo necesita paquetes de `@evzla/infra` (+ `@evzla/config` por el `tsconfig`): `pnpm install --frozen-lockfile --filter @evzla/infra...` alcanza.
- El bundle viaja como **tarball** (`tar` preserva los symlinks de pnpm que `zip-bundle.ts` necesita; `upload-artifact` los materializa). Ver DUDA 1.
- Guarda nueva: el bundle descargado no puede tener symlinks que salgan de `.open-next` (el zipper de la CLI los sigue con credenciales en el entorno).

## PIEZAS POR CAPA (ruta · responsabilidad · imports)
Infraestructura (`@evzla/infra`; no importa `packages/*` ni `apps/*`):
- `infra/lib/ci-stack.ts` · `EvzlaCiStack`: provider importado, rol, política, outputs; exporta `GITHUB_SUB`, `BOOTSTRAP_ROLE_ARNS` para tests · `aws-cdk-lib`, `aws-cdk-lib/aws-iam`, `constructs`, `./contract.js`.
- `infra/lib/ci-app.ts` · `buildCiApp(app): { ci: EvzlaCiStack }` (lee `account` del context, región `CONTRACT.region`) · `./ci-stack.js`, `./contract.js`.
- `infra/bin/evzla-ci.ts` · `new App()` + `buildCiApp(app)` + `synth()` · `../lib/ci-app.js`. `cdk.json` NO cambia (`app` sigue en `bin/evzla.ts`; su context aplica igual con `--app`).
- `infra/scripts/ci/resolve-ref.mjs` · valida/resuelve el `ref` → SHA (AC-20) · `node:child_process`, `node:fs`.
- `infra/scripts/ci/check-public-env.mjs` · guarda `.env.production` (AC-22) · `node:fs`.
- `infra/scripts/ci/check-bundle.mjs` · `open-next.output.json` presente (AC-23) + escaneo (AC-14) + symlinks confinados · `node:fs`, `node:path`.
- `infra/scripts/ci/smoke.mjs` · GET `/` y `/admin` con reintentos (AC-26..29); `SMOKE_RETRY_DELAY_MS` solo para tests · `fetch` nativo Node 22.
- `infra/scripts/ci/write-summary.mjs` · `GITHUB_STEP_SUMMARY` con SHA + `EvzlaStack.CloudFrontDomain` y nada más (AC-34) · `node:fs`.
- CI: `.github/workflows/deploy-production.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS` (mod.).
- Tests (Vitest; `infra/vitest.config.ts` ya incluye `**/*.test.ts`): `infra/test/ci-stack.test.ts`, `infra/test/ci-scripts.test.ts`, `infra/test/ci-workflow.test.ts`, `infra/test/repo-hygiene.test.ts`. devDep exacta nueva en infra: `yaml` 2.9.1 (ya en lockfile como transitiva). `evzla-stack.test.ts` no se toca (AC-6). Las fixtures con patrones de secreto se generan en runtime (concatenando partes), nunca literales en el repo.

## DOMINIO · APLICACIÓN
- No aplica: sin aggregates, VOs, puertos ni casos de uso.

## BORDE (workflow `.github/workflows/deploy-production.yml`)
- `on`: `pull_request` (`branches: [main]`), `push` (`branches: [main]`), `workflow_dispatch.inputs.ref` (string, `required: false`, `default: ""`). Sin `pull_request_target`/`workflow_run`. `permissions: {contents: read}` global; ningún `secrets.*`; todo `actions/checkout` con `persist-credentials: false`.
- `resolve` (`ubuntu-24.04-arm`, `timeout-minutes: 5`): checkout de `github.sha` con `fetch-depth: 0` (incluye tags) → `node infra/scripts/ci/resolve-ref.mjs` con `INPUT_REF`/`EVENT_NAME` **por `env:`** (nunca `${{ inputs.ref }}` en `run:`). Evento ≠ dispatch o ref vacío → `GITHUB_SHA`. Si no: `^[0-9a-f]{40}$` o tag `^[A-Za-z0-9][A-Za-z0-9._/-]*$` existente (`git show-ref --verify refs/tags/<t>`); `git rev-parse <ref>^{commit}`; `git merge-base --is-ancestor <sha> origin/main`. Output `sha`. Un SHA anterior a 0026 no tiene `infra/scripts/ci/` → `checks` falla cerrado (documentado).
- `checks` (`needs: resolve`, arm, `timeout-minutes: 30`, sin `id-token`, sin `AWS_*`): checkout `needs.resolve.outputs.sha` → `pnpm/action-setup` (sin `version`) → `actions/setup-node` (22, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `check-public-env.mjs apps/web/.env.production` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm audit --audit-level=high` → `pnpm --filter @evzla/web build:aws` → `check-bundle.mjs apps/web/.open-next` → (solo `push`/`workflow_dispatch`) `tar -C apps/web -czf "$RUNNER_TEMP/open-next.tgz" .open-next` → `actions/upload-artifact` (`name: open-next-${{ github.run_id }}`, `path: ${{ runner.temp }}/open-next.tgz`, `retention-days: 1`, `if-no-files-found: error`, `overwrite: true` para re-runs del mismo run).
- `deploy` (`needs: [resolve, checks]`, `if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'`, `environment: Production`, `permissions: {contents: read, id-token: write}`, `concurrency: {group: deploy-production, cancel-in-progress: false}` a nivel de job para no serializar PRs, arm, `timeout-minutes: 60`), en este orden:
  1. checkout del mismo SHA; 2. `actions/download-artifact` (`name: open-next-${{ github.run_id }}`, `path: ${{ runner.temp }}/artifact`; sin `pattern`/`merge-multiple`); 3. `tar -tzf` validado (toda entrada bajo `.open-next/`, sin `/` inicial ni `..`) y `tar -xzf … --no-same-owner -C apps/web`; 4. `check-bundle.mjs apps/web/.open-next`; 5. pnpm/node; 6. `pnpm install --frozen-lockfile --filter @evzla/infra...`; 7. `pnpm exec cdk synth --ci --quiet` en `infra/` (sin credenciales: `buildApp` no hace lookups; account/region fijos en `cdk.json`); 8. `aws-actions/configure-aws-credentials` (`role-to-assume: arn:aws:iam::934106163170:role/evzla-github-deploy`, `aws-region: sa-east-1`, `role-session-name: evzla-deploy-${{ github.run_id }}`, `role-duration-seconds: 3600`); 9. `pnpm exec cdk deploy EvzlaStack --app cdk.out --ci --require-approval never --outputs-file cdk-outputs.json` (`working-directory: infra`); 10. `write-summary.mjs`; 11. `smoke.mjs https://encuentramevzla.com`. Sin `set -x`, `cat cdk-outputs.json` ni `env`. Ningún `build:aws`/`next build`/`pnpm test|lint|build` (AC-15).
- Duda 2 (verificado en código): `bin/evzla.ts` → `lib/app.ts` → stacks importan solo `aws-cdk-lib`, `constructs`, `node:*`; `bundle-job.ts` usa `esbuild` (devDep de infra) para empaquetar `jobs/purge/handler.ts`, que resuelve `postgres` (dep de infra) y deja `@aws-sdk/*` externo; `zip-bundle.ts` usa el binario `zip` del runner; `tsx` y `aws-cdk` son devDeps de infra; `infra/tsconfig.json` extiende `@evzla/config` (lo trae el sufijo `...`). Nada de `apps/web`, `packages/core|db` ni `xlsx` → el filtro alcanza. `ci-workflow.test.ts` fija el comando exacto.
- Smoke (Cloudflare solo DNS → respuesta directa de CloudFront): `fetch(url, {redirect: "manual"})`, 5 intentos × 10 s. `/` → 200 y cuerpo contiene `<title>EncuéntrameVzla —`; `/admin` → 3xx con `Location` cuyo path es `/admin/login`. En fallo imprime `ruta status intento`, exit 1, sin rollback. URLs en constante exportada (AC-29).
- Acciones (SHA de 40 hex + `# vX.Y.Z`; el implementer resuelve el SHA del último release estable de cada major): `actions/checkout` v5, `pnpm/action-setup` v4, `actions/setup-node` v5, `actions/upload-artifact` v4, `actions/download-artifact` v4 (o v5 si es la estable), `aws-actions/configure-aws-credentials` v5. Ninguna otra.
- `.github/dependabot.yml`: `version: 2`, una entrada `package-ecosystem: github-actions`, `directory: /`, `schedule.interval: weekly`, `commit-message.prefix: "chore(ci)"`.
- Environment `Production` (UI, humano): required reviewer `jorgeluisd`, self-review permitido, deployment branches = solo `main`.

## INFRAESTRUCTURA
- `EvzlaCiStack` (sa-east-1, `Tags.of(this).add(CONTRACT.costTag…)`): `iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GitHubOidc", "arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com")` con ARN literal (sin tokens). `new iam.Role(this, "DeployRole", { roleName: "evzla-github-deploy", maxSessionDuration: Duration.hours(1), assumedBy: new iam.WebIdentityPrincipal(arn, { StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com", "token.actions.githubusercontent.com:sub": "repo:jorgeluisd/encuentramevzla:environment:Production" } }) })`. Un `addToPolicy`: `sts:AssumeRole` sobre los 6 ARN literales `arn:aws:iam::<account>:role/cdk-hnb659fds-{deploy,file-publishing,lookup}-role-<account>-{sa-east-1,us-east-1}`. Outputs `DeployRoleArn`, `DeployRoleName`.
- `ci-stack.test.ts` (AC-1..6): `resourceCountIs("AWS::IAM::Role", 1)`; rol con `RoleName`, `MaxSessionDuration: 3600`, tag `project`; trust con `Match.exact` y `JSON.stringify` sin `StringLike` ni `*`; `resourceCountIs("AWS::IAM::OIDCProvider", 0)` y sin `Custom::AWSCDKOpenIdConnectProvider`; statements del `AWS::IAM::Policy` = uno solo, `sts:AssumeRole`, array exacto de 6 ARN; `Object.keys(Outputs)` = los 2; `buildCiApp` crea un único stack; `buildApp` (fixture) no contiene `EvzlaCiStack`; `cdk.json#app` === `pnpm exec tsx bin/evzla.ts`.
- `ci-scripts.test.ts`: resolve-ref con repos git temporales (SHA válido ancestro, tag, SHA no ancestro, basura, valor que empieza por `-`, ref vacío) (AC-20/21); check-public-env con fixtures (AC-22, incl. `export`); check-bundle con dir vacío, `.env.local`, `x.pem`, `x.key`, contenido con patrón de access key AWS o cabecera PEM de clave privada, symlink a `/etc/hostname` y a `../..` → fallo listando solo rutas; symlink interno pnpm → pasa (AC-14/23); smoke contra `node:http` local (200/307/404/timeout) (AC-26..28).
- `ci-workflow.test.ts` (parse con `yaml`): AC-7..13, 15..18 y el orden de AC-16 (índice de credenciales > índice de todo `pnpm install` y de `cdk synth`); `checks` sin `configure-aws-credentials`/`AWS_`; artifact solo con `if` de push/dispatch; ninguna `${{ inputs.* }}` dentro de `run:`.

## DATOS + PLAN DE MIGRACIÓN
- Sin DDL, RLS ni backfill. Stacks sin cambios de synthesizer: el primer deploy por CI de un SHA igual al último deploy manual es no-op.

## EVENTOS Y JOBS
- Ninguno de aplicación. Artifact `open-next-<run_id>` (tarball, 1 día) entre `checks` y `deploy` del mismo run.

## COMPOSITION ROOT
- `bin/evzla.ts` → `buildApp` (sin cambios). `bin/evzla-ci.ts` → `buildCiApp`. Sin tokens `Symbol` (no hay DI de aplicación).

## AMENAZAS (activo · actor · vector · mitigación · test)
| Activo | Actor | Vector | Mitigación | Test |
|---|---|---|---|---|
| Credenciales AWS | Fork/PR | Añadir `environment: Production` o `pull_request_target` | `sub` exacto; env solo `main` + reviewer; `id-token` solo en `deploy` | AC-2, 7, 8, 11, 32 |
| Credenciales AWS | Dependencia npm comprometida | Script de install/build leyendo credenciales | Install completo y build solo en `checks` sin credenciales; `deploy` instala solo infra y antes de OIDC | AC-10, 15, 16 |
| Credenciales AWS | Bundle manipulado en `checks` | Symlink a `/proc/self/environ` o fuera de `.open-next` que el zipper de la CLI sigue y sube al bucket de assets | `check-bundle.mjs` rechaza symlinks fuera de `.open-next`; validación de entradas del tar; synth antes de credenciales | `ci-scripts.test.ts` (nuevo) |
| Cuenta compartida (Blockealo) | Job aprobado malicioso | `cfn-exec` = AdministratorAccess (**residual aceptado**) | Rol solo asume 6 roles del bootstrap; reviewer + `main`; CODEOWNERS; SHA pin. Futuro: cuenta AWS propia en Organizations | AC-4, 32, 35 + ADR-0011 |
| Rol de CI | Pipeline | Reescribir su propia confianza | Stack en entrypoint aparte; `cdk deploy EvzlaStack` sin `--all` | AC-6, 16 |
| OIDC provider | Pipeline | Crear/modificar | Importado por ARN | AC-3 |
| Runner | Input de dispatch | Inyección vía `inputs.ref` | `env:` + regex + ancestro de `origin/main` | AC-20, `ci-workflow.test.ts` |
| Acciones | Upstream | Tag movido | SHA de 40 hex + Dependabot | AC-18, 19 |
| Secretos | Mantenedor / build | `.env*` versionado o horneado en el bundle (artifact público) | Negación puntual; guarda de claves; escaneo en `checks` y `deploy` | AC-14, 22, 24, 25, 33 |
| Logs de CI | Público | Outputs/env impresos | Summary filtrado, sin `set -x` | AC-34 |
| Datos de pacientes | Smoke | Llamar buscador → `search_log` | Solo GET `/`, `/admin` | AC-29 |
| RDS / Secrets | CI | Acceso directo | Rol sin permisos propios; CI nunca migra | AC-4 |
| Disponibilidad | Push concurrente / binarios x64 | CFN a medias / bundle roto | `cancel-in-progress: false`; runner arm64; smoke | AC-17, 26, 27 |
| Esquema | Rollback | SHA viejo sobre esquema migrado | Expand/contract documentado | AC-30 |
| Dependencias | npm | Advisory alto | `pnpm audit --audit-level=high` | AC-9 |

## ROLLBACK / FLAG
- Sin flag: sin environment protegido no hay credenciales. Apagar CI = deshabilitar el workflow; el deploy manual de hoy sigue igual.
- Rollback de app: `workflow_dispatch` desde `main` con `ref` (SHA/tag ancestro de `origin/main`) → `checks` recompila desde ese ref y sube su artifact → misma aprobación → deploy. No revierte esquema.
- Plan de despliegue de la feature (humano, en orden): (1) `aws sts get-caller-identity` = 934106163170; (2) desde `infra/`: `pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" diff EvzlaCiStack` y luego `… deploy EvzlaCiStack` (único deploy manual; no requiere `.open-next`); (3) verificar con `aws iam get-role --role-name evzla-github-deploy` el trust y que no hay otras políticas; (4) GitHub → environment `Production`: required reviewer `jorgeluisd`, branches solo `main`; (5) merge del PR (el primer run de `push` corre checks + deploy con aprobación); (6) verificar en el primer run que el `sub` real coincide (si falla en AssumeRole: sin efecto en prod, corregir literal, nunca `StringLike`). Rollback de la feature: `pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" destroy EvzlaCiStack` y deshabilitar el workflow; nada más cambia.

## DOCUMENTACIÓN Y REPO
- `.gitignore`: `!apps/web/.env.production` justo tras `.env.*`. `repo-hygiene.test.ts`: AC-24 (`git check-ignore` de `.env`, `apps/web/.env.local`, `apps/web/.env`), AC-25, AC-33 (patrones en `.github/`, `infra/` excl. `node_modules`/`cdk.out`, `.env.production`), AC-35, AC-30/31 (grep).
- `CODEOWNERS`: añadir `/.github/ @jorgeluisd` e `/infra/ @jorgeluisd`.
- `docs/ARCHITECTURE.md`: nueva `## 11. Deploy`: migración aditiva a prod a mano (túnel SSM, `evzla_owner`, OK explícito) → merge → checks + build → aprobación `Production` → deploy → smoke; expand/contract en PR distintos; rollback por dispatch solo con esquema compatible; deploy manual de `EvzlaCiStack`; riesgo residual `cfn-exec`.
- `README.md`: párrafo "Deploy" que enlaza `docs/ARCHITECTURE.md#11-deploy` y el comando de `EvzlaCiStack`. `.claude/skills/db-prod-scripts.md`: "migración antes del merge; nunca contract en el mismo PR que la app". `pull_request_template.md` sin cambios. `adr/0011`: separación build/deploy, riesgo residual, futuro cuenta propia → ACEPTADO tras GATE 1.

## SKILLS A CARGAR EN IMPLEMENTACIÓN
- `.claude/skills/privacy-and-security.md`, `testing-vitest.md`, `architecture.md`, `db-prod-scripts.md`, `git-commits.md`.

## DUDAS ABIERTAS
1. AC-12 pide subir `apps/web/.open-next` como path del artifact; el diseño sube un tarball de `.open-next` porque `upload-artifact` no preserva symlinks y `zip-bundle.ts` depende de ellos (layout pnpm). Ajustar el texto de AC-12 a "tarball que solo contiene `.open-next`".
2. AC-13 pide `run-id: ${{ github.run_id }}`: en `download-artifact` eso obliga a pasar `github-token` y añadir `actions: read` a `deploy`. Sin `run-id` descarga del run actual por defecto, con menos permisos. Recomendado omitirlo; el test acepta ausencia o valor `github.run_id`.
3. AC-16 nombra `cdk deploy EvzlaStack …`; el diseño añade `cdk synth` antes de las credenciales y `--app cdk.out` en el deploy (tsx/esbuild no corren con credenciales). Confirmar el ajuste.

## DECISIONES DEL ORQUESTADOR (2026-10-22)
- Dudas 1–3 aceptadas tal cual: tarball de `.open-next` (AC-12), download sin `run-id` (AC-13), `cdk synth` antes de credenciales + `--app cdk.out` (AC-16). La spec quedó ajustada en esos tres AC.
- Verificado: `infra/lib/evzla-stack.ts` usa `Vpc.fromVpcAttributes` (sin lookups) y no hay `cdk.context.json`: el synth funciona sin credenciales.

## DECISIONES TRAS REVISIÓN (orquestador, 2026-10-23)
- Ratificado: `upload-artifact` v7.0.2 y `download-artifact` v8.0.2 (en lugar de v4/v5): corren en node24, igual que las otras 5 acciones (verificado en su `action.yml` al SHA fijado). Queda registrado como desviación; T-16 verifica que los inputs usados existan en esas versiones y que la ruta de descarga por `name`+`path` siga siendo `path/<archivo>`.
- Ratificadas como desviaciones menores: `SMOKE_REQUEST_TIMEOUT_MS`, el modo `--tar-entries` y el chequeo de mismo origen en `/admin`.
- A corregir (tareas T-15 a T-17 del plan): cache de pnpm en `deploy` (alto, seguridad), guarda de symlinks por `realpath` y destinos de links/hardlinks del tar (medio), run obsoleto aprobado tarde, binario `zip`, `name:` en los pasos, comentario impreciso sobre `id-token`, greps tolerantes, helpers compartidos y bajas baratas.
- Riesgos aceptados que van al GATE 2 para decisión humana: `id-token: write` a nivel de job durante install filtrado + synth (mitigado: sin cache, lockfile con integridad, solo dependencias de infra); outputs no secretos de EvzlaStack en el log público; trust que acepta cualquier workflow del repo con `environment: Production` (mitigado: CODEOWNERS sobre `.github/`, environment solo `main` + reviewer); el rollback despliega infra y scripts del SHA viejo; artifact descargable 1 día; `check-public-env` valida solo el prefijo.

## DECISIONES TRAS LA SEGUNDA REVISIÓN (orquestador + humano, 2026-10-24)
- A corregir (T-18 y T-19 del plan, aprobadas por el humano): el parser de headers de `check-bundle --tar-archive` no lee igual que `tar` (campo `prefix` con magic GNU, prioridad de pax sobre `L`/`K`, registro pax `size`), confirmado con GNU tar 1.35 y bsdtar; y las rutas de `open-next.output.json` se resuelven sin contención en `infra/lib/open-next-output.ts`.
- Fuera de 0026: `body-parser` 2.3.0 (GHSA-27r3-jxmh-p828, vía `@opennextjs/aws` > `express`) hace fallar `pnpm audit --audit-level=high`; se corrige en un PR de dependencias aparte contra `develop`.
- Al backlog: N-3 (`//` en nombres del tar), N-4 (`gunzipSync` sin límite), destino léxico de symlinks en el tar, guarda de imports incompleta, `[^.]*` en los greps, borrado del temporal fuera de `finally`, aserción de frase histórica y las 4 bajas que dejó T-17.
