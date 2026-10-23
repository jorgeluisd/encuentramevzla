# ADR-0011 — Deploy a producción con GitHub Actions + OIDC

Fecha: 2026-10-22 · Estado: **PROPUESTO** · Complementa: [ADR-0010](./0010-migracion-supabase-vercel-a-aws.md) (punto "deploy con `cdk` desde `infra/`").

## Contexto

Desde el corte a AWS (ADR-0010) el deploy de `EvzlaStack` es manual (`cdk deploy` desde `infra/`, credenciales locales).
No hay CI: ni checks automáticos en `main` ni registro de qué SHA está en producción. La cuenta AWS es compartida con
Blockealo, que ya tiene un OIDC provider de GitHub y un bootstrap CDK estándar (`hnb659fds`, v32, sa-east-1 y us-east-1)
cuyo rol `cfn-exec` tiene `AdministratorAccess`. El repo es público.

## Decisión

1. Un workflow de GitHub Actions (`.github/workflows/deploy-production.yml`) corre `checks` en cada push a `main` y, tras
   **aprobación manual** en el environment `Production` (required reviewer, solo rama `main`), `cdk deploy EvzlaStack`
   (con sus dependencias, sin `--exclusively`) en runners `ubuntu-24.04-arm`, seguido de un smoke test.
2. Autenticación por **OIDC**, sin claves AWS de larga vida en GitHub. Se **importa** el provider existente; un stack
   `EvzlaCiStack`, en un entrypoint CDK propio y desplegado a mano, crea el rol `evzla-github-deploy`.
3. El rol confía solo en `sub = repo:jorgeluisd/encuentramevzla:environment:Production` y `aud = sts.amazonaws.com`
   (`StringEquals`), y solo puede `sts:AssumeRole` sobre los roles `deploy`, `file-publishing` y `lookup` del bootstrap.
4. Orden fijo: **migraciones a mano (túnel SSM, OK explícito) → merge → deploy**. Las migraciones son aditivas y
   compatibles con la versión anterior; los borrados de esquema van en un PR posterior. El CI nunca toca la RDS.
5. Rollback: `workflow_dispatch` con `ref` de un SHA anterior, por el mismo camino y la misma aprobación.

## Consecuencias

- (+) Deploys reproducibles desde un SHA conocido, con checks obligatorios y aprobación registrada.
- (+) Sin secretos AWS en GitHub; `apps/web/.env.production` se versiona porque solo contiene la site key pública.
- (−) **Riesgo residual:** vía `cfn-exec`, un job aprobado tiene poder efectivo de admin sobre toda la cuenta, incluidos
  recursos de Blockealo. Los controles son la condición `sub`, la protección del environment, acciones fijadas por SHA,
  permisos mínimos del token y `CODEOWNERS`.
- (−) El rollback no revierte el esquema: depende de la disciplina expand → contract.
- Mitigación futura (no decidida): bootstrap propio con otro qualifier y `--cloudformation-execution-policies` acotadas.

## Alternativas consideradas

- `EvzlaCiStack` dentro de `buildApp`: acopla su deploy a un build de OpenNext y permite que `cdk deploy --all` desde
  el pipeline reescriba su propia confianza.
- Claves de acceso IAM en secrets de GitHub: credenciales de larga vida; contrario a la política de secretos.
- Seguir con deploy manual: sin checks obligatorios ni trazabilidad del SHA desplegado.
