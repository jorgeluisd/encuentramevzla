# 02-spec — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK, bootstrap `hnb659fds`)

## RESUMEN
- Checks en `pull_request` y `push` a `main`; deploy de `EvzlaStack` (con dependencias) solo desde `main`, tras aprobación en `Production`.
- Separación build/deploy: `checks` instala, valida y compila el bundle OpenNext SIN `id-token` ni credenciales AWS y lo publica como artifact de retención corta; `deploy` lo descarga, instala solo lo necesario para `cdk` ANTES de pedir credenciales, y recién entonces configura OIDC y corre `cdk deploy`.
- Auth por OIDC: rol `evzla-github-deploy` (EvzlaCiStack, entrypoint `infra/bin/evzla-ci.ts`, desplegado a mano) con `sub` exacto; solo asume `cdk-hnb659fds-{deploy,file-publishing,lookup}-role-934106163170-{sa-east-1,us-east-1}`.
- Se mantiene el bootstrap `hnb659fds` existente (no se toca). Riesgo residual explícito en su propia sección.
- Rollback por `workflow_dispatch` con `ref`; smoke test post-deploy; Dependabot para `github-actions`.
- Orden migraciones (a mano) → merge → deploy documentado. Fuera: migraciones automáticas, deploy de Blockealo, re-bootstrap, cuenta AWS propia.
- Cada AC indica verificación: [CDK] assertions, [STATIC] parseo de YAML/archivos, [SMOKE], [MANUAL].

ESTADO: implementada (c0f30fd)

## OBJETIVO · ACTORES
Desplegar producción de forma reproducible desde un SHA conocido, con checks obligatorios, sin claves AWS de larga vida y sin que código de terceros instalado por `pnpm install` corra con credenciales AWS.
- Mantenedor (`jorgeluisd`): aprueba en `Production`, despliega `EvzlaCiStack`, aplica migraciones.
- Workflow (`deploy-production.yml`): único principal que asume `evzla-github-deploy`.
- Colaborador/fork externo: solo dispara `checks`, sin secretos ni credenciales AWS.

## CRITERIOS DE ACEPTACIÓN
### Stack de CI [CDK] (`infra/test/ci-stack.test.ts`, `Template.fromStack(EvzlaCiStack)`)
- AC-1 Given EvzlaCiStack When se sintetiza Then hay exactamente un `AWS::IAM::Role` `evzla-github-deploy` con `MaxSessionDuration` 3600 y tag `project=encuentramevzla`.
- AC-2 Given el trust Then solo `sts:AssumeRoleWithWebIdentity`, `Principal.Federated` = `arn:aws:iam::934106163170:oidc-provider/token.actions.githubusercontent.com`, y `StringEquals` con `...:aud = sts.amazonaws.com` y `...:sub = repo:jorgeluisd/encuentramevzla:environment:Production`. Sin `StringLike` ni `*`.
- AC-3 Given la plantilla Then NO contiene `AWS::IAM::OIDCProvider` ni custom resource que lo cree (se importa por ARN).
- AC-4 Given las políticas del rol Then solo `sts:AssumeRole` sobre exactamente los 6 ARN `arn:aws:iam::934106163170:role/cdk-hnb659fds-{deploy,file-publishing,lookup}-role-934106163170-{sa-east-1,us-east-1}`. Sin `image-publishing`, sin `cfn-exec`, sin otras acciones, sin `Resource: "*"`.
- AC-5 Given EvzlaCiStack Then sus outputs son `DeployRoleArn` y `DeployRoleName` y nada más.
- AC-6 Given `infra/bin/evzla-ci.ts` Then instancia solo EvzlaCiStack (sa-east-1); `buildApp` y `cdk.json#app` no lo referencian, así `cdk deploy --all` en `infra/` no lo incluye. Los tests existentes de `evzla-stack.test.ts` siguen verdes sin cambios. [STATIC+CDK]

### Workflow `.github/workflows/deploy-production.yml` [STATIC] (test que parsea el YAML)
- AC-7 Given el workflow Then `on` = `pull_request` (a `main`), `push` (branches: `main`) y `workflow_dispatch` con input `ref` (string, no requerido, vacío → `github.sha`). No existe `pull_request_target` ni `workflow_run`.
- AC-8 Given permisos Then `permissions: {contents: read}` a nivel workflow; `id-token: write` aparece solo en el job `deploy`.
- AC-9 Given job `checks` Then corre en todos los eventos, runner `ubuntu-24.04-arm`, y ejecuta en orden: checkout del ref, setup pnpm (versión de `packageManager`) y Node 22, `pnpm install --frozen-lockfile`, guarda `.env.production` (AC-22), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit --audit-level=high`, `build:aws` en `apps/web`, verificación del bundle (AC-23), escaneo del bundle (AC-14) y subida del artifact (AC-12). No usa `secrets.*`.
- AC-10 Given job `checks` Then ningún paso configura credenciales AWS (sin `aws-actions/configure-aws-credentials`, sin variables `AWS_*`) y el job no declara `id-token`.
- AC-11 Given job `deploy` Then `needs: checks`, `environment: Production`, `if` exige `github.event_name != 'pull_request'` y `github.ref == 'refs/heads/main'`, mismo runner y mismo `ref` que `checks`.

### Separación build/deploy [STATIC]
- AC-12 Given `checks` en evento `push` o `workflow_dispatch` Then empaqueta `apps/web/.open-next` en un tarball que conserva los symlinks (upload-artifact los reemplaza por copias y rompe el layout pnpm que necesita `zip-bundle.ts`) y lo sube con `actions/upload-artifact` (fijado por SHA), nombre que incluye `github.run_id`, `retention-days` ≤ 1, `if-no-files-found: error`. En `pull_request` no se sube artifact.
- AC-13 Given `deploy` Then descarga con `actions/download-artifact` el artifact del run actual por nombre exacto, sin `run-id` (sin `run-id` solo ve el run actual y no requiere `actions: read`); no usa artifacts de otros runs ni `latest`. Antes de extraer, valida que ninguna entrada del tar salga de `.open-next` y que ningún symlink apunte fuera de `.open-next`.
- AC-14 Given el bundle antes de subirlo Then un paso falla si `.open-next` contiene archivos `.env`, `.env.*`, `*.pem`, `*.key`, o coincidencias de `AKIA[0-9A-Z]{16}`, `aws_secret_access_key` CON valor asignado (`aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+]{40}`: el nombre suelto aparece en el código del AWS SDK que trae el bundle y no es un secreto) o `-----BEGIN .*PRIVATE KEY-----`; el mensaje lista rutas, nunca contenido. (Excepción: valores `NEXT_PUBLIC_*` inlined en JS, públicos por diseño.) El mismo escaneo se repite en `deploy` tras descargar. [STATIC con fixtures sintéticas]
- AC-15 Given `deploy` Then no ejecuta `build:aws`, `next build` ni `open-next build`, ni `pnpm test/lint/build`; el bundle proviene solo del artifact.
- AC-16 Given `deploy` Then el orden de pasos es: checkout del mismo `ref` → descarga y validación del artifact (AC-13) → extracción en `apps/web` → verificación del bundle (AC-23) y escaneo (AC-14) → setup pnpm/Node → instalación mínima (`pnpm install --frozen-lockfile --filter @evzla/infra...`) → `cdk synth` (sin credenciales: el stack no usa lookups) → `aws-actions/configure-aws-credentials` (`role-to-assume` = ARN de `evzla-github-deploy`, `aws-region: sa-east-1`, sin access keys) → `pnpm exec cdk deploy EvzlaStack --app cdk.out --ci --require-approval never --outputs-file cdk-outputs.json` desde `infra/` → smoke. Ningún `pnpm install`, `tsx` ni `esbuild` corre con credenciales. Sin `--exclusively` ni `--all`; no despliega EvzlaCiStack.

### Concurrencia y supply chain [STATIC]
- AC-17 Given el workflow Then `concurrency: {group: deploy-production, cancel-in-progress: false}` y `timeout-minutes` en cada job.
- AC-18 Given cada `uses:` de terceros Then fijado por SHA de 40 hex (con comentario de versión); ni `@v1`, `@main` ni `@master`.
- AC-19 Given `.github/dependabot.yml` Then declara exactamente dos entradas: (a) `github-actions`, `directory: /`, `schedule.interval: monthly`, un único grupo que cubre todas las acciones; (b) `npm`, `directory: /`, `open-pull-requests-limit: 0` (sin PRs de versión) y un grupo con `applies-to: security-updates` y `patterns: ["*"]` (un solo PR de seguridad por gestor). Alertas y security updates de Dependabot están habilitados en el repo (hecho por el orquestador el 2026-10-22).

### Guardas y rollback
- AC-20 Given `workflow_dispatch` When `ref` no es SHA de 40 hex ni tag existente, o el commit no es ancestro de `origin/main` Then un paso inicial falla con mensaje claro antes de `checks`. [STATIC: script con repos temporales sintéticos]
- AC-21 Given `workflow_dispatch` con `ref` válido Then `checks` y `deploy` operan sobre ese `ref` (checkout, build y artifact del mismo SHA) y exigen la misma aprobación de `Production`; con `ref` vacío usan `github.sha`.
- AC-22 Given `apps/web/.env.production` When una línea no vacía ni comentario tiene clave sin prefijo `NEXT_PUBLIC_` (se admite `export `) Then el paso falla, imprime solo número de línea y clave (nunca valor) y `deploy` no corre. Con solo `NEXT_PUBLIC_*` pasa. [STATIC con fixtures]
- AC-23 Given `build:aws` terminó (en `checks`) o el artifact se descargó (en `deploy`) When falta `.open-next/open-next.output.json` Then el job falla antes de cualquier paso de credenciales AWS. [STATIC: orden + script con directorio vacío]
- AC-24 Given `.gitignore` Then contiene `!apps/web/.env.production` inmediatamente tras `.env.*`, no contiene `!.env.*` ni `!**/.env*`, y `git check-ignore apps/web/.env.local apps/web/.env .env` los sigue ignorando. [STATIC]
- AC-25 Given `.env.production` versionado Then tiene exactamente una línea no vacía: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<valor>`. [STATIC]

### Smoke test [SMOKE] (script versionado `infra/scripts/smoke.sh` o equivalente; testeable contra servidor local falso)
- AC-26 Given deploy exitoso When `GET https://encuentramevzla.com/` sin seguir redirecciones, hasta 5 intentos con 10 s entre ellos Then 200 y el cuerpo contiene el texto estable fijado en el diseño (DUDA 1).
- AC-27 Given lo anterior When `GET /admin` Then 3xx con `Location` hacia el login del equipo (no 404).
- AC-28 Given 5 intentos fallidos Then el job termina rojo, imprime estado/ruta (no cuerpo) y no hay rollback automático.
- AC-29 Given el smoke Then solo hace GET a `/` y `/admin`; nunca al buscador, `/api/*` ni RPC (sin filas en `search_log`). [STATIC: lista de URLs]

### Documentación
- AC-30 Given `docs/ARCHITECTURE.md` Then tiene sección "Deploy": migración aditiva aplicada a prod a mano (túnel SSM, `evzla_owner`, OK explícito) → merge → checks+build → aprobación → deploy → smoke; expand/contract en PR distintos; rollback por dispatch y su condición (esquema compatible). `README.md` enlaza la sección y el comando de EvzlaCiStack; `.claude/skills/db-prod-scripts.md` incluye "migración antes del merge; nunca contract en el mismo PR que la app". `.github/pull_request_template.md` no cambia. [STATIC: grep]
- AC-31 Given `adr/0011` Then pasa a ACEPTADO tras GATE 1, describe la separación build/deploy y el riesgo residual. [STATIC]

## CASOS BORDE
- AC-2 `sub` incorrecto: `environment:production` (minúscula), `ref:refs/heads/main`, `pull_request` u otro repo no satisfacen el trust (valor único y literal; verificación real [MANUAL] en el primer run).
- AC-11 rama distinta de `main`: push/dispatch desde otra rama → `deploy` omitido por `if`; además `Production` solo admite `main`.
- AC-9/11 PR desde fork: corre `checks` sin secretos ni `id-token`; no sube artifact; `deploy` omitido; el `sub` de un PR nunca coincide con AC-2.
- AC-17 deploy concurrente: corre uno, queda uno pendiente (el más nuevo reemplaza al pendiente); nunca se cancela el que corre.
- AC-20/21 rollback: `ref` válido anterior reconstruye el bundle de ese SHA, repite checks y exige la misma aprobación.
- AC-13 artifact ausente (expiró, no se subió, nombre distinto) → `deploy` falla en la descarga, antes de credenciales AWS. Artifact de otro run (otro `run_id` en el nombre) → no se descarga. Un re-run parcial de `deploy` usa el artifact del mismo run mientras no expire (1 día); si expiró, relanzar todo el workflow.
- AC-14 artifact con `.env*` o secreto → `checks` falla y no sube nada; si aparece tras descargar en `deploy`, falla antes de credenciales (el artifact es descargable públicamente).
- AC-22 clave no pública (`DATABASE_URL=x`, `export FOO=1`) falla; `export NEXT_PUBLIC_X=1`, comentarios y líneas vacías pasan.
- AC-23 bundle ausente o `open-next.output.json` faltante → fallo temprano sin tocar AWS.
- AC-16 sin `--exclusively`: cambios en certificado/SES se despliegan antes que EvzlaStack; por eso el rol cubre ambas regiones.
- Rol de CI asumiendo `cdk-hnb659fds-cfn-exec-role-*` directo o roles ajenos → AccessDenied (AC-4) [MANUAL].
- Reintento del job: `cdk deploy` idempotente; sin cambios es no-op.

## SEGURIDAD (escenarios negativos)
- AC-32 Un PR (incluso de fork) que añada `environment: Production` al workflow no obtiene credenciales: el environment solo admite `main` y exige reviewer. [MANUAL, configuración registrada en el ADR]
- AC-33 Ningún secreto en el repo: búsqueda de `AKIA[0-9A-Z]{16}`, `aws_secret_access_key` y claves privadas en `.github/`, `infra/` y `.env.production`. [STATIC]
- AC-34 El workflow no imprime `cdk-outputs.json` completo ni `env`, y no usa `set -x` en pasos con credenciales. [STATIC]
- AC-35 CODEOWNERS cubre `.github/` e `infra/`. [STATIC]
- Código de dependencias (`pnpm install` de `apps/web`, scripts de build) nunca corre con credenciales AWS ni `id-token` (AC-8, AC-10, AC-15, AC-16).
- El rol de CI no tiene acceso a la RDS ni a Secrets Manager (AC-4); CI nunca migra.
- Privacidad: la feature no toca `sensitive`, RPC, `search_log` ni PII (AC-29). El artifact solo contiene el bundle compilado (AC-14).

## RIESGO RESIDUAL (aceptado)
- `cfn-exec` del bootstrap `hnb659fds` tiene `AdministratorAccess` y la cuenta es compartida con Blockealo: quien logre un job `deploy` aprobado tiene poder efectivo de admin, incluidos recursos de Blockealo (que ya tiene `blockealo-deploy` con poder equivalente).
- Controles: `sub` exacto (AC-2), rol limitado a 6 roles del bootstrap (AC-4), environment `Production` con reviewer y rama `main`, build sin credenciales (AC-8, AC-10, AC-16), acciones fijadas por SHA y Dependabot (AC-18, AC-19), sin `pull_request_target` (AC-7), CODEOWNERS (AC-35), escaneo del artifact (AC-14).
- Superficie remanente: el bundle se ejecuta como código Lambda y `cdk` corre el código de `infra/` del SHA aprobado; la revisión del PR y la aprobación son el control.

## CONTRATOS
- Workflow: entradas `push` (SHA), `pull_request`, `workflow_dispatch{ref?: string}`. Salidas: estado de jobs; artifact `open-next-<run_id>` (retención 1 día, solo `.open-next`); `cdk-outputs.json` NO se publica; `GITHUB_STEP_SUMMARY` con SHA desplegado y `CloudFrontDomain`.
- Environment `Production`: required reviewer (self-review permitido, único mantenedor), branches = `main`.
- EvzlaCiStack outputs: `DeployRoleArn`, `DeployRoleName`. Despliegue manual: `pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" deploy EvzlaCiStack`.
- Sin endpoints HTTP, eventos ni jobs de aplicación nuevos. Smoke: salida 0/≠0, URLs en AC-26/27/29.

## CONSISTENCIA
- Inmediato: checks, aprobación, asunción del rol (TTL ≤ 1 h), resultado del smoke tras `cdk deploy`.
- Eventual: propagación de CloudFront y posible caché de Cloudflare (smoke con reintentos; DUDA 1).
- Orden: migración a prod (manual, antes del merge, aditiva) → app. El rollback no revierte el esquema (AC-30).
- Artifact: vive ≤ 1 día; deploy y artifact pertenecen al mismo run y SHA.

## FUERA DE ALCANCE
- Migraciones automáticas en CI; acceso de CI a la RDS.
- Deploy de recursos de Blockealo; cambios a su OIDC provider o a `blockealo-deploy`.
- Re-bootstrap o cambios a `hnb659fds`/`CDKToolkit`; bootstrap propio con otro qualifier y política acotada.
- Mitigación futura: cuenta AWS propia para EncuéntrameVzla en AWS Organizations.
- `cdk diff` previo a la aprobación; rollback automático; notificaciones; entorno Preview/staging.

## DUDAS ABIERTAS
1. Texto estable de la portada para AC-26 y si Cloudflare hace proxy (afecta AC-26/27); lo cierra el designer, no bloquea.
2. `cdk deploy` sintetiza `bin/evzla.ts` → `buildApp`, que exige `.open-next/open-next.output.json` en `../apps/web/.open-next`: el designer fija dónde se descarga el artifact (AC-13, AC-16). Si la instalación mínima no alcanza para sintetizar, AC-16 se ajusta.
3. ¿El `ref` de rollback acepta tags además de SHA? La spec asume que sí.

## DUDAS RESUELTAS
- Bootstrap propio (qualifier `evzla`, política acotada, Deny): retirado por el humano; se sigue con `hnb659fds`.
- Mitigación de fondo del riesgo admin: futuro (cuenta propia en Organizations).
- Checks en `pull_request`: sí. Dependabot `github-actions`: sí.
- OIDC provider existe, se importa. Bootstrap `hnb659fds` v32 en sa-east-1 y us-east-1: confirmado.
- Aprobación manual en `Production`; `pnpm audit --audit-level=high`; documentación en ARCHITECTURE/README/skill.
- Cloudflare NO hace proxy (solo DNS): las respuestas vienen directo de CloudFront. Smoke: el `<title>` de `/` empieza con `EncuéntrameVzla —`; `GET /admin` → 307 a `/admin/login` (verificado en producción el 2026-10-22).
- `ref` de rollback: SHA de 40 hex o tag, siempre ancestro de `origin/main`.
