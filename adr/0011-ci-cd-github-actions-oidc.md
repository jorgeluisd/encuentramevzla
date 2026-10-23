# ADR-0011 — Deploy a producción con GitHub Actions + OIDC

Fecha: 2026-10-22 · Estado: **ACEPTADO** (2026-10-22, firmado por Jorge Diaz; registro en [`docs/sdd/0026-ci-deploy-production/gates.md`](../docs/sdd/0026-ci-deploy-production/gates.md)) · Complementa: [ADR-0010](./0010-migracion-supabase-vercel-a-aws.md) (punto "deploy con `cdk` desde `infra/`").

## Contexto

Desde el corte a AWS (ADR-0010) el deploy de `EvzlaStack` es manual (`cdk deploy` desde `infra/`, credenciales locales).
No hay CI: ni checks automáticos en `main` ni registro de qué SHA está en producción. La cuenta AWS es compartida con
Blockealo, que ya tiene un OIDC provider de GitHub y un bootstrap CDK estándar (`hnb659fds`, v32, sa-east-1 y us-east-1)
cuyo rol `cfn-exec` tiene `AdministratorAccess`. El repo es público.

## Decisión

1. Un workflow de GitHub Actions (`.github/workflows/deploy-production.yml`) corre `checks` en cada PR y push a `main`
   y, tras **aprobación manual** en el environment `Production` (required reviewer, solo rama `main`), `cdk deploy
   EvzlaStack` (con sus dependencias, sin `--exclusively`) en runners `ubuntu-24.04-arm`, seguido de un smoke test.
   La configuración del environment `Production` (reviewer y rama `main`) es un requisito manual en GitHub: el
   workflow la usa pero no la crea.
2. **Build y deploy separados.** El job `checks` construye el bundle de OpenNext sin credenciales, después de
   instalar todo y correr lint, typecheck, tests y audit; en push o dispatch lo sube como tarball (retención 1 día).
   El job `deploy` usa solo ese artifact del mismo run y SHA: lo revalida, instala solo `@evzla/infra` y corre
   `cdk synth` antes de pedir credenciales; recién entonces asume el rol con `aws-actions/configure-aws-credentials` v6
   (fijada por SHA, runtime `node24`). Ningún install completo ni build corre con credenciales.
3. Autenticación por **OIDC**, sin claves AWS de larga vida en GitHub. Se **importa** el provider existente; un stack
   `EvzlaCiStack`, en un entrypoint CDK propio y desplegado a mano, crea el rol `evzla-github-deploy`. Se usa el
   bootstrap CDK existente (`hnb659fds`), sin bootstrap propio ni cambios a `CDKToolkit`.
4. El rol confía solo en `sub = repo:jorgeluisd/encuentramevzla:environment:Production` y `aud = sts.amazonaws.com`
   (`StringEquals`), y solo puede `sts:AssumeRole` sobre los roles `deploy`, `file-publishing` y `lookup` del bootstrap.
5. Orden fijo: **migraciones a mano (túnel SSM, OK explícito) → merge → deploy**. Las migraciones son aditivas y
   compatibles con la versión anterior; los borrados de esquema van en un PR posterior. El CI nunca toca la RDS.
6. Rollback: `workflow_dispatch` con `ref` de un SHA anterior, por el mismo camino y la misma aprobación.

## Consecuencias

- (+) Deploys reproducibles desde un SHA conocido, con checks obligatorios y aprobación registrada.
- (+) Sin secretos AWS en GitHub; `apps/web/.env.production` se versiona porque solo contiene la site key pública.
- (−) **Riesgo residual:** vía `cfn-exec`, un job aprobado tiene poder efectivo de admin sobre toda la cuenta, incluidos
  recursos de Blockealo. Los controles son la condición `sub`, la protección del environment, acciones fijadas por SHA,
  permisos mínimos del token y `CODEOWNERS`.
- (−) El rollback no revierte el esquema: depende de la disciplina expand → contract.
- Mitigación futura (no decidida): cuenta AWS propia para EncuéntrameVzla en Organizations, que saca a Blockealo del
  alcance de `cfn-exec`.

## Alternativas consideradas

- `EvzlaCiStack` dentro de `buildApp`: acopla su deploy a un build de OpenNext y permite que `cdk deploy --all` desde
  el pipeline reescriba su propia confianza.
- Claves de acceso IAM en secrets de GitHub: credenciales de larga vida; contrario a la política de secretos.
- Bootstrap propio con otro qualifier y `--cloudformation-execution-policies` acotadas: fuera de alcance; en una cuenta
  compartida no aísla tanto como una cuenta propia.
- Seguir con deploy manual: sin checks obligatorios ni trazabilidad del SHA desplegado.
