# 00-explore — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK)

## RESUMEN
- Hoy NO hay CI/CD: `.github/` solo tiene `CODEOWNERS` y `pull_request_template.md`. El deploy es manual (`cdk deploy` desde `infra/`, ADR-0010).
- Los checks existen como scripts raíz vía turbo: `lint`, `typecheck`, `test`, `build`. No existe script `audit` (es `pnpm audit` directo).
- `build:aws` = `open-next build` en `apps/web`; salida `apps/web/.open-next`, que `infra/cdk.json` consume (`openNextPath`).
- `buildApp` (`infra/lib/app.ts`) instancia 3 stacks: `EvzlaCertificateStack` (us-east-1, si `customDomain`, hoy true), `EvzlaEmailStack` y `EvzlaStack` (sa-east-1). `EvzlaStack` depende del email stack y usa `crossRegionReferences`.
- No hay synthesizer personalizado: se asume bootstrap estándar (qualifier `hnb659fds`) en sa-east-1 Y us-east-1.
- `apps/web/.env.production` existe local, esta ignorado por `.gitignore:15` (`.env.*`) y no está trackeado. Hay que versionarlo (negar en `.gitignore`).
- No hay documento del orden "migraciones -> app"; ni el ADR-0010 ni ARCHITECTURE.md hablan de deploy/CI.
- Lambdas: Node 22, ARM_64 (`open-next-site.ts:84-85`, `evzla-stack.ts:159-160`); el runner x64 puede bundlear (ver riesgos).

## CONTEXTOS y CAPAS
- Solo tooling/infra: `infra/` (`@evzla/infra`), `.github/`, `apps/web` (config de build, env), docs. Cero dominio/aplicación; no se toca `packages/*` ni `sensitive`.

## EXISTE (verificado con ls/read)
- `infra/bin/evzla.ts` -> `new App()` + `buildApp(app, infraDir)`; `infra/cdk.json` -> `app: "pnpm exec tsx bin/evzla.ts"`, context fijo: `account` (934106163170), `rdsClientSgId`, `openNextPath` (`../apps/web/.open-next`), `customDomain: true`, `mailFrom`, `budgetEmail`. Todo el contexto está en cdk.json: CI no necesita `-c`.
- `infra/lib/app.ts` -> `ctx()` lanza si falta una clave; instancia stacks; `readOpenNextOutput` falla si no existe `.open-next/open-next.output.json` ("Corre build:aws").
- `infra/lib/contract.ts` -> `CONTRACT` (region sa-east-1, VPC/subnets de Blockealo, nombres de secretos `evzla/db/*`, `evzla/app`, `evzla/origin`).
- `infra/lib/evzla-stack.ts` -> stack principal; outputs `CloudFrontDomain`, `CloudFrontDistributionId`, `CognitoUserPoolId`... (insumo para el smoke test; `cdk deploy --outputs-file` ya esta ignorado por `.gitignore`: `cdk-outputs.json`).
- `infra/lib/open-next-site.ts`, `open-next-output.ts`, `zip-bundle.ts`, `bundle-job.ts` (esbuild local), `certificate-stack.ts`, `email-stack.ts`.
- `infra/test/evzla-stack.test.ts` + `infra/test/fixtures/web/.open-next` (synth con account `111111111111`, `customDomain:false`; pasa sin build real). `pnpm test` en infra ya corre via turbo.
- `infra/package.json`: `aws-cdk` 2.1144.0 (CLI) y `aws-cdk-lib` 2.272.0 como devDep/dep -> el CI debe usar `pnpm exec cdk`, no un `npx cdk` global.
- Raiz: `packageManager pnpm@9.15.0`, `engines node >=22`, `.npmrc` (`save-exact`, `auto-install-peers`), `turbo.json` (lint/typecheck/test dependen de `^build`; `globalEnv: DATABASE_URL`), `pnpm-workspace.yaml`. `pnpm-lock.yaml` presente.
- `apps/web`: `build` (`next build`), `build:aws` (`open-next build`), `open-next.config.ts` (defaults, `default: {}`), `.env.local` y `.env.production` locales (NO abiertos; ignorados).
- Consumo del site key: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en `components/search-panel.tsx` y `components/servicios/turnstile-field.tsx` (inlined en build de Next, por eso debe estar en el build de CI). Tambien `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MANUAL_URL` (opcionales).
- Docs: `.claude/skills/db-prod-scripts.md` (regla "prod requiere OK explicito", tunel SSM a 127.0.0.1:15432, migracion atomica `apply-NNNN.mjs` con BEGIN/COMMIT), `.claude/skills/database.md` (seccion "Migraciones SQL", `supabase/migrations/` hasta `0020_provenance.sql`), `ROUTER.md` (rutas por tema), `adr/0010`, `docs/ARCHITECTURE.md` (sin seccion de deploy), `README.md:51` (mapa de carpetas).

## HAY QUE CREAR
- `.github/workflows/<ci-deploy>.yml` -> job `checks` (todo push a main) + job `deploy` (`environment: production`, `needs: checks`), `concurrency`, `workflow_dispatch` con input de ref/SHA.
- `infra/lib/ci-stack.ts` (`EvzlaCiStack`): OIDC provider GitHub + rol asumible por `repo:<owner>/<repo>` y environment `production`, con permiso solo `sts:AssumeRole` sobre los roles del bootstrap.
- Registro del stack en `infra/lib/app.ts` (o `bin/evzla.ts`) + test en `infra/test/`. Ojo: `buildApp` tipa su retorno; `cdk deploy EvzlaStack` NO debe arrastrar `EvzlaCiStack` (sin dependencia entre ellos).
- Negacion en `.gitignore` (`!apps/web/.env.production`) y versionar ese archivo solo con la site key publica.
- Script/paso de smoke test (ruta a definir; no existe `/api/health` — hay `app/api/` por inspeccionar).
- Documento del orden "migraciones a mano -> merge -> deploy": candidatos `docs/ARCHITECTURE.md` (seccion nueva), `.claude/skills/db-prod-scripts.md` y `database.md` (checklist de migracion), `.github/pull_request_template.md` (check "migracion aplicada"), `README.md`.

## DECISIONES PREVIAS
- ADR-0010 #10: CDK en `infra/`, deploy con `cdk` desde `infra/`; infra 100% AWS sa-east-1; secretos solo en Secrets Manager (CLAUDE.md prohibe secretos en repo).
- CLAUDE.md s.6: PR con `pnpm typecheck && pnpm test && pnpm build`; usar siempre pnpm; Gate humano antes de implementar.
- db-prod-scripts: migraciones a prod solo con OK explicito del dueño, via tunel SSM + `evzla_owner` (RDS privada: un runner de GitHub NO alcanza la RDS, consistente con "migraciones fuera del CI").
- Probable nuevo ADR (lo decide el proposer): CI/CD + OIDC. No hay ADR de CI hoy.

## RIESGOS
- Tenancy/datos personales: ninguno directo (verificado: la feature no toca datos). Riesgo indirecto: `.gitignore` negacion debe ser puntual (`!apps/web/.env.production`), no `!.env.*`, para no versionar `.env`, `.env.local`. `.env` raiz existe (no abierto). Verificar que el `.env.production` local NO contenga mas que variables publicas antes de `git add` (no lo abri; revisar a mano: pude haber DATABASE_URL u otros secretos).
- Secretos/IAM: el rol OIDC solo-assume-bootstrap hereda el poder de los roles de CDK (`cfn-exec` suele ser AdministratorAccess): equivale a admin de la cuenta para quien pueda disparar el workflow. La condicion `sub` (repo + `environment:production`) y la protección del environment (reviewers) son el control real. Cuenta compartida con Blockealo (VPC/RDS importados): un deploy erroneo afecta recursos ajenos.
- Bootstrap: sin `DefaultStackSynthesizer` custom -> qualifier `hnb659fds`, roles `cdk-hnb659fds-{deploy,file-publishing,image-publishing,lookup,cfn-exec}-role-<account>-<region>`. Se necesita bootstrap en `sa-east-1` y `us-east-1` (CertificateStack + cross-region refs). No verificable sin llamar a AWS: confirmar con el humano.
- `cdk deploy EvzlaStack` despliega tambien dependencias (EmailStack, CertificateStack) salvo `--exclusively`. Cada cross-region ref usa un custom resource (Lambda) en us-east-1.
- Arquitectura: Lambdas arm64, runner `ubuntu-latest` x64. `build:aws` empaqueta node_modules de Next; `sharp`/binarios nativos (`@img/sharp-linux-*` y `@ast-grep/napi-*` existen en lockfile para ambas arqs) pueden quedar x64 en el bundle -> verificar si OpenNext fuerza arm64 o si hace falta runner `ubuntu-24.04-arm` / `--os --arch` en install. Hoy el bundle se construye en macOS local; sin evidencia de que funcione desde x64.
- Supply chain: `xlsx` se instala desde `https://cdn.sheetjs.com/...tgz` (tarball URL en lockfile) -> `pnpm install --frozen-lockfile` depende de ese CDN; `pnpm audit` no cubre bien ese paquete. `pnpm audit` puede fallar el pipeline por un advisory ajeno al cambio (definir umbral `--audit-level`, `--prod`).
- Env de build: `NEXT_PUBLIC_*` se hornean en `next build`; en CI no existiran `.env.local`. `turbo.json` `globalEnv: DATABASE_URL` no afecta si no se define. `lint/typecheck/test` dependen de `^build` (turbo): coste de CI.
- Orden migracion->app: migraciones aditivas e idempotentes necesarias; si falla el deploy tras migrar, el rollback por `workflow_dispatch` de un commit viejo corre contra un esquema ya migrado (compat hacia atras no garantizada). Concurrencia: `cancel-in-progress: false` para no cortar un `cdk deploy` a medias (CloudFormation queda en UPDATE_IN_PROGRESS).
- Rollback por dispatch: el job `checks` debe correr tambien sobre el SHA elegido; `.open-next` debe reconstruirse de ese SHA (no hay artefacto previo). Integridad: acciones fijadas por SHA (requiere mantenerlas, p.ej. Dependabot/Renovate: hay `chore(deps)` periodicos, herramienta no verificada).
- Migracion de esquema: ninguna (feature). Concurrencia/idempotencia: ver arriba.

## INSUMOS FALTANTES
- Confirmar bootstrap de CDK (qualifier, regiones, politica de `cfn-exec`) — humano/dueño de la cuenta; bloquea diseño del rol (parcial: se puede especificar con el default y marcar supuesto).
- Owner/nombre exacto del repo GitHub, y si el environment `production` ya existe con required reviewers — humano; bloquea la condicion `sub` del trust policy.
- Valor del site key de Turnstile y confirmación de que es la PUBLICA — humano; no bloquea la spec.
- URL/ruta del smoke test (endpoint y respuesta esperada) — humano/proposer; no bloquea.
- Existencia previa de un OIDC provider de GitHub en la cuenta 934106163170 (cuenta compartida con Blockealo: el provider es unico por URL y un segundo `CfnOIDCProvider` fallaria) — humano; bloquea EvzlaCiStack.
- Branch protection/permiso de merge en main — humano; no bloquea.

## DUDAS ABIERTAS
1. ¿Existe ya un OIDC provider `token.actions.githubusercontent.com` en la cuenta (Blockealo)? Crear vs importar.
2. ¿El bundle OpenNext construido en x64 sirve para Lambda arm64 (sharp, binarios nativos), o se usa runner arm64?
3. ¿`.env.production` local contiene solo variables publicas? ¿Se versiona tal cual o se reescribe?
4. ¿Bootstrap en us-east-1 y sa-east-1 con qualifier estandar?
5. ¿Nivel de `pnpm audit` (`--audit-level`, `--prod`) y que hacer con `xlsx` desde CDN?
6. ¿Smoke test contra el dominio `encuentramevzla.com` o `CloudFrontDomain` del output? ¿Que endpoint (no hay health check verificado)?
7. ¿`EvzlaCiStack` entra en `buildApp` (los tests y `cdk deploy EvzlaStack` conviven) o en un app/entrypoint aparte?
8. ¿Donde se documenta el orden migraciones->app (ADR nuevo, ARCHITECTURE.md, skills, PR template)?

## INSUMOS RESUELTOS (orquestador, consultas read-only del humano)
- OIDC provider de GitHub YA EXISTE en la cuenta (`oidc-provider/token.actions.githubusercontent.com`, creado por Blockealo, que usa el rol `blockealo-deploy`): importar, no crear.
- Bootstrap CDK: `CDKToolkit` CREATE_COMPLETE en sa-east-1 y us-east-1, qualifier `hnb659fds`, versión 32.
- `cdk-hnb659fds-cfn-exec-role-…-sa-east-1` tiene `AdministratorAccess` (default del bootstrap; compartido con Blockealo: no se re-bootstrapea).
- Repo `jorgeluisd/encuentramevzla` es PÚBLICO → runners arm64 hospedados gratis (`ubuntu-24.04-arm`), misma arquitectura que las Lambdas.
- Environments de GitHub existentes: `Production` y `Preview` (restos de Vercel), sin reglas de protección. Sin Dependabot ni Renovate.
- `apps/web/.env.production` revisado por el humano: una sola línea `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key pública>`.
- Decisiones del humano: aprobación manual (required reviewer) en `Production`; documentar migraciones → app en `docs/ARCHITECTURE.md` (sección Deploy), `README.md` y `.claude/skills/db-prod-scripts.md` (NO en la plantilla de PR: solo admite las tres secciones); `pnpm audit --audit-level=high`.
