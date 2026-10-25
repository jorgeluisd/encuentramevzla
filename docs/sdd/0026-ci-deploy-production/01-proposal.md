# 01-proposal — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK)

## RESUMEN
- Hay una sola bifurcación real: **dónde vive `EvzlaCiStack`** (eje a). El resto de los ejes tiene un solo enfoque
  razonable dado lo ya resuelto, y se decide abajo como parte del enfoque recomendado.
- Recomendado **A**: `EvzlaCiStack` en un **entrypoint CDK aparte** (`infra/bin/evzla-ci.ts`), desplegado a mano una vez;
  importa el OIDC provider existente por ARN; rol `evzla-github-deploy` que **solo** puede `sts:AssumeRole` sobre los
  roles `deploy`/`file-publishing`/`lookup` del bootstrap `hnb659fds` en sa-east-1 y us-east-1.
- Workflow único `.github/workflows/deploy-production.yml`: `checks` → `deploy` (`environment: Production`, reviewer
  requerido, solo rama `main`), runner `ubuntu-24.04-arm`, `concurrency` sin cancelar, `cdk deploy EvzlaStack` **sin**
  `--exclusively`, rollback por `workflow_dispatch` con `ref`, smoke test contra `https://encuentramevzla.com`.
- Riesgo residual aceptado explícitamente: `cfn-exec` es AdministratorAccess en cuenta compartida con Blockealo.
- **ADR requerido** (proceso de deploy + nueva confianza IAM con poder efectivo de admin): ADR-0011 en estado PROPUESTO.

## ENFOQUES (eje a: ubicación de EvzlaCiStack)

### A — Entrypoint aparte `infra/bin/evzla-ci.ts` (recomendado)
- Descripción: nueva app CDK que solo instancia `EvzlaCiStack` (sa-east-1). Se despliega a mano, una vez, con credenciales
  del dueño: `pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" deploy EvzlaCiStack`. `cdk.json` sigue apuntando a
  `bin/evzla.ts`; el context (`account`) de `cdk.json` aplica igual.
- Pros: desplegarlo no exige `build:aws` (hoy `buildApp` lanza si falta `.open-next/open-next.output.json`); el pipeline
  nunca sintetiza ni toca el stack que define su propia confianza; `buildApp` y su tipo de retorno no cambian (tests
  existentes intactos); `cdk deploy --all` en `infra/` no puede arrastrarlo por accidente.
- Contras: dos comandos de deploy en `infra/` (hay que documentarlo); el stack no aparece en `cdk ls` por defecto.
- Adopción: baja (1 archivo bin, 1 stack, 1 test con `Template.fromStack`). Salida: `cdk destroy` del stack con el mismo
  `--app`; sin efecto sobre EvzlaStack.
- Invariantes: no toca `@evzla/core`, `sensitive`, roles de BD ni secretos. Cumple "secretos solo en Secrets Manager":
  OIDC elimina claves AWS de larga vida en GitHub.

### B — `EvzlaCiStack` dentro de `buildApp`
- Descripción: se añade al retorno de `buildApp` sin `addStackDependency` respecto a EvzlaStack.
- Pros: un solo entrypoint, `cdk ls` lo muestra, un único lugar de registro.
- Contras: para desplegar o difar el stack de CI hace falta un `.open-next` real (o el fixture), acoplando dos ciclos de
  vida distintos; `cdk deploy --all` lo desplegaría desde el pipeline (el rol podría reescribir su propia confianza);
  cambia el contrato tipado de `buildApp` y los tests de synth.
- Adopción: baja. Salida: mover a A más tarde es trivial (reversible), pero un deploy accidental desde CI no lo es.
- Invariantes: iguales a A.

(No se propone crear el rol a mano por consola/CLI: rompería "infra como código en `infra/`" de ADR-0010 sin beneficio.)

## DECISIONES DEL ENFOQUE A (ejes b–f; un solo enfoque real por eje)

**(b) Rol y confianza**
- Provider: `OpenIdConnectProvider.fromOpenIdConnectProviderArn(...)` con
  `arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com` (no se crea; es de Blockealo).
- Trust (`sts:AssumeRoleWithWebIdentity`), `StringEquals`, sin comodines:
  `token.actions.githubusercontent.com:aud = sts.amazonaws.com` y
  `token.actions.githubusercontent.com:sub = repo:jorgeluisd/encuentramevzla:environment:Production`.
- Permisos: solo `sts:AssumeRole` sobre `cdk-hnb659fds-{deploy,file-publishing,lookup}-role-<account>-{sa-east-1,us-east-1}`.
  Sin `image-publishing` (no hay assets Docker: `bundle-job.ts` usa bundling local) ni `cfn-exec` directo.
  `MaxSessionDuration` 1 h.
- Riesgo residual: `deploy-role` pasa `cfn-exec` (AdministratorAccess) a CloudFormation → quien logre un job aprobado en
  `Production` tiene poder de admin sobre la cuenta, incluida Blockealo. Controles reales: (1) `sub` exacto;
  (2) environment `Production` con required reviewer y "deployment branches" = solo `main` (bloquea que un PR o rama
  defina un job con ese environment); (3) acciones fijadas por SHA; (4) `permissions: contents: read` global e
  `id-token: write` solo en `deploy`; (5) sin `pull_request_target`; (6) `CODEOWNERS` cubriendo `.github/` e `infra/`.
  Mitigación de fondo (fuera de alcance, en el ADR): bootstrap propio con otro qualifier y política de ejecución acotada.

**(c) Workflow** (un archivo; separar en `ci.yml` reutilizable es reversible si luego se añaden checks de PR)
- Disparadores: `push` a `main` y `workflow_dispatch` con input `ref` (SHA/tag; por defecto `github.sha`).
- `checks` (runner `ubuntu-24.04-arm`): checkout del `ref`, pnpm vía `packageManager`, Node 22,
  `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit --audit-level=high`,
  guarda de que `apps/web/.env.production` solo contiene claves `NEXT_PUBLIC_*`.
- `deploy` (`needs: checks`, `environment: Production`, mismo runner y mismo `ref`): install, `build:aws` en `apps/web`
  (se reconstruye en el job: no se publican artefactos en un repo público), credenciales OIDC en sa-east-1,
  `pnpm exec cdk deploy EvzlaStack --ci --require-approval never --outputs-file cdk-outputs.json` desde `infra/`.
- **Sin `--exclusively`**: el CLI despliega primero `EvzlaCertificateStack` (us-east-1) y `EvzlaEmailStack` (no-op si no
  cambian). Con `--exclusively` un cambio de certificado/SES quedaría sin desplegar mientras EvzlaStack ya lo referencia.
  Por eso el rol necesita los roles del bootstrap en ambas regiones.
- `concurrency: { group: deploy-production, cancel-in-progress: false }`. Nota: GitHub mantiene un solo run pendiente
  por grupo; un push nuevo reemplaza al pendiente (no al que corre). Aceptable: siempre se despliega lo más nuevo.
- Rollback: `workflow_dispatch` desde `main` con `ref` = SHA anterior bueno; corre `checks` y `deploy` sobre ese SHA,
  pasa por la misma aprobación. CloudFormation ya revierte solo si el deploy falla a mitad.

**(d) Smoke test** (paso final de `deploy`, `curl` con reintentos ~5 × 10 s, sin seguir redirecciones)
- `GET https://encuentramevzla.com/` → 200 y el cuerpo contiene un texto estable de la portada (la spec fija cuál).
- `GET https://encuentramevzla.com/admin` → 3xx con `Location` hacia el login del equipo (ejercita la Lambda de
  servidor, PR #112), no solo contenido estático.
- No se llama al buscador ni a ningún RPC: evitaría escribir en `search_log` y exigiría Turnstile.
- Si falla: job rojo, sin rollback automático; el humano decide el dispatch de rollback.

**(e) `.env.production`**: añadir `!apps/web/.env.production` justo tras `.env.*` en `.gitignore` (negación puntual,
nunca `!.env.*`) y versionar la única línea `NEXT_PUBLIC_TURNSTILE_SITE_KEY=...` (pública por diseño: se hornea en el JS).

**(f) Documentación del orden migraciones → app**
- `docs/ARCHITECTURE.md`, sección nueva "Deploy": (1) migración aplicada a prod a mano (túnel SSM, `evzla_owner`, OK
  explícito) **antes** del merge que la necesita; migraciones aditivas y compatibles con la versión anterior
  (expand → contract en dos PRs); (2) merge a `main`; (3) `checks`; (4) aprobación en `Production`; (5) deploy;
  (6) smoke; rollback por dispatch, que solo es seguro si el esquema siguió siendo compatible.
- `README.md`: párrafo corto que enlaza esa sección y el comando de despliegue de `EvzlaCiStack`.
- `.claude/skills/db-prod-scripts.md`: regla "la migración va antes del merge; nunca contract en el mismo PR que la app".

## CONDICIONES BLOQUEANTES
| Condición | Responsable | Fallback |
|---|---|---|
| Los roles del bootstrap confían en la cuenta (`arn:aws:iam::<account>:root`, default v32) en ambas regiones | Humano (lectura IAM) | Añadir confianza explícita requeriría re-bootstrap: no se hace; se para y se replantea con ADR |
| Environment `Production` con required reviewer, "prevent self-review" desactivado (único mantenedor) y branches = `main` | Humano (UI GitHub) | Sin protección no se habilita el job `deploy` (queda solo `checks`) |
| El `sub` real del token coincide exactamente (mayúsculas de `Production`, owner/repo) | Implementer, primer run | Ajustar el valor exacto; nunca pasar a `StringLike` con `*` |
| `EvzlaCiStack` desplegado a mano antes del primer run de `deploy` | Humano | El workflow falla al asumir el rol; sin efecto en prod |
| `build:aws` en `ubuntu-24.04-arm` produce un bundle que arranca en Lambda arm64 | Implementer + smoke | Si falla, el smoke lo detecta; rollback por dispatch y se investiga binarios nativos |
| `pnpm install --frozen-lockfile` alcanza `cdn.sheetjs.com` (tarball de `xlsx`) | Externo | Reintentar; si el CDN cae, deploy manual como hoy |

## RECOMENDACIÓN — Enfoque A
1. Desacopla el ciclo de vida del rol del de la app: desplegar `EvzlaCiStack` no requiere `.open-next`, y el pipeline
   no puede modificar su propia confianza vía `--all`.
2. No cambia `buildApp` ni sus tests: respeta "no romper lo verde".
3. Rol mínimo real dado el bootstrap compartido: solo asume roles del bootstrap, `sub` exacto y environment protegido
   con rama `main`; no añade permisos IAM directos.
4. Runner arm64 elimina la duda de binarios x64 en Lambdas arm64, gratis por ser repo público.
5. Sin `--exclusively` y con concurrencia sin cancelar se evitan estados a medias en CloudFormation y referencias
   cross-region desalineadas.

ADR: PROPUESTO → `adr/0011-ci-cd-github-actions-oidc.md` (los ADR del repo viven en `adr/`, no en `docs/adr/`).

## DECISIONES MENORES TOMADAS (reversibles)
- Nombres: workflow `deploy-production.yml`; jobs `checks`/`deploy`; rol `evzla-github-deploy`; stack `EvzlaCiStack`;
  archivos `infra/lib/ci-stack.ts`, `infra/bin/evzla-ci.ts`, `infra/test/ci-stack.test.ts`.
- ARN del rol escrito en el workflow (el account id ya es público en `infra/cdk.json`); no es secreto.
- Incluir `lookup-role` aunque hoy no hay `fromLookup` (solo lectura; evita fallos del CLI si se añade una lookup).
- `build:aws` se repite en `deploy` en vez de pasar artefactos entre jobs (repo público; coste: minutos de CI).
- Etiqueta `project=encuentramevzla` en `EvzlaCiStack`, como el resto de stacks.

## DUDAS ABIERTAS
1. ¿Se añaden checks en `pull_request` (mismo archivo con `if` en `deploy`, o `ci.yml` aparte)? No es parte del pedido.
2. ¿Añadir `.github/dependabot.yml` solo para `github-actions`, para mantener los SHA fijados? Hoy no hay herramienta.
3. ¿El dominio está proxied por Cloudflare? Si sí, el smoke podría ver caché de Cloudflare; alternativa: probar también
   `CloudFrontDomain` del `cdk-outputs.json`.
4. Texto estable de la portada para el smoke (lo fija la spec con el humano).
5. ¿Se quiere un `cdk diff` visible antes de aprobar? Requeriría un job previo con credenciales (otro `sub`/rol de solo
   lectura); fuera de alcance salvo que el humano lo pida.
6. Mitigación de fondo del riesgo admin (bootstrap con qualifier propio y política acotada): ¿se agenda como feature?

## DECISIONES DEL HUMANO SOBRE LA PROPUESTA (2026-10-22, registradas por el orquestador)
- Enfoque A aceptado como base (EvzlaCiStack en entrypoint aparte `infra/bin/evzla-ci.ts`). ADR-0011 sigue PROPUESTO hasta GATE 1.
- Duda 1 → SÍ: el job de checks corre también en `pull_request` (sin deploy, sin credenciales AWS).
- Duda 2 → SÍ: Dependabot solo para `github-actions` (mantiene los SHA fijados).
- Duda 6 → SÍ, EN ESTA FEATURE: bootstrap CDK propio con qualifier dedicado (p. ej. `evzla`) en sa-east-1 y us-east-1, con `--cloudformation-execution-policies` acotada a los servicios que usan EvzlaStack, EvzlaEmailStack, EvzlaCertificateStack y EvzlaCiStack (en lugar de AdministratorAccess). Los stacks pasan a usar ese qualifier (synthesizer). El rol de CI solo asume los roles del bootstrap `evzla`. El bootstrap lo ejecuta el humano una vez; el bootstrap `hnb659fds` (de Blockealo) no se toca.
- Smoke test y proxy de Cloudflare: los cierra el designer (no bloquean).
- **REVISIÓN (2026-10-22, humano): se SACA el bootstrap propio de esta feature** (reemplaza la decisión de la duda 6). Motivo: la política acotada necesita permission boundaries para acotar de verdad (crear roles + PassRole ≈ admin), deja `cloudfront:*` sin acotar, obliga a migrar stacks productivos y a mantener la política por cada servicio nuevo; Blockealo ya tiene `blockealo-deploy` con el mismo poder. Se sigue con el bootstrap `hnb659fds` existente.
- **En su lugar:** separar build y deploy. El job que corre `pnpm install` y compila (`checks` + build del bundle OpenNext) NO tiene credenciales AWS ni `id-token: write`; publica el bundle como artifact de corta retención. El job `deploy` (environment `Production`) descarga ese artifact, instala solo lo necesario para `cdk` y corre `cdk deploy`. Mitigación de fondo anotada para el futuro (fuera de alcance): cuenta AWS propia para EncuéntrameVzla en AWS Organizations.
