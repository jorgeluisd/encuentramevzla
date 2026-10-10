# ADR-0010 — Migración de Supabase/Vercel a AWS

Fecha: 2026-10-09 · Estado: **aceptado** · Supera parcialmente: [ADR-0008](./0008-reconciliacion-fuente-consolidada.md), [ADR-0009](./0009-ejecucion-reconciliacion.md) (solo dónde vive el esquema `reconciliation`).

## Contexto

Hasta octubre de 2026 la app corría en **Vercel** (Next.js) y **Supabase** (Postgres, PostgREST, Auth
magic-link/OTP, Edge Functions). El proyecto ya operaba una cuenta AWS para Blockealo con una instancia
RDS privada en `sa-east-1`. Mantener dos proveedores adicionales implicaba otra facturación, otras
credenciales y otra superficie que vigilar, y el pooler de Supabase ya había causado incidentes en
`/admin/metricas` (queries en serie con timeout, PR #103).

El corte se ejecutó el **9 de octubre de 2026**; Supabase y Vercel quedaron dados de baja ese día.

## Decisión

1. **Región y cuenta:** todo en `sa-east-1`, en la **misma cuenta AWS que Blockealo**. Los recursos de
   Blockealo (VPC, subredes, NAT, instancia RDS, sus security groups) solo se **importan**; nunca se
   modifican. Los costos se separan con la etiqueta `project=encuentramevzla` y el presupuesto
   `evzla-monthly`.
2. **Base de datos separada en el RDS de Blockealo:** base lógica `encuentramevzla` en la instancia
   `blockealo-prod-db` (PostgreSQL 18, privada, TLS obligatorio). Mismos schemas (`public`, `sensitive`,
   `extensions`) y mismo SQL canónico (`supabase/migrations/`, nombre heredado).
3. **Roles mínimos en vez de anon/authenticated/service_role:** `evzla_owner` (migraciones),
   `evzla_admin` (la app de `/admin`), `evzla_public` (**solo** EXECUTE de `search_patient` y
   `list_solidarity_services`) y `evzla_job` (**solo** EXECUTE de `purge_search_log`). Credenciales en
   **Secrets Manager** (`evzla/db/*`, `evzla/app`); la app los lee por nombre. El cliente nunca habla con
   la base: no hay PostgREST.
4. **Auth propia con Cognito:** user pool `evzla-admin` (Essentials), inicio **sin contraseña por
   EMAIL_OTP** (flujo `USER_AUTH`), sin auto-registro, OTP enviado por SES. La autorización sigue siendo la
   allow-list `team_members` (sin cambios de dominio); invitar a un miembro lo da de alta en Cognito.
5. **Next.js completo en Lambda vía OpenNext + CloudFront:** un único bundle (`build:aws`) en Lambda
   (Node 22, arm64) detrás de CloudFront, con header de verificación de origen. Las subidas de Excel van
   directo a **S3** con URL prefirmada (Lambda no acepta cuerpos > ~6 MB).
6. **Purga de `search_log` con EventBridge Scheduler:** diaria (03:00 UTC) → Lambda con el rol
   `evzla_job` → `public.purge_search_log()` (> 90 días). Reemplaza el job programado de Supabase.
7. **Backups:** backups automáticos de RDS + dumps `pg_dump` cifrados y versionados en S3
   (`evzla-backups-<account-id>`).
8. **Esquema `reconciliation` archivado fuera de la base viva:** el staging de ADR-0008/0009 se exportó
   como dump aparte al bucket de backups y **no** se cargó en `encuentramevzla`. Para volver a usar
   `packages/db/scripts/reconciliation` hay que restaurarlo en una base de trabajo.
9. **DNS en Cloudflare:** el dominio `encuentramevzla.com` apunta a CloudFront; los registros de
   validación ACM y DKIM de SES se cargan a mano.
10. **Infra como código:** AWS CDK en `infra/` (`EvzlaCertificateStack`, `EvzlaEmailStack`,
    `EvzlaStack`), deploy con `cdk` desde `infra/`.

## Consecuencias

- **Privacidad:** el aislamiento pasa de RLS + rol `anon` a **GRANTs por rol**: el camino público usa
  `evzla_public`, que no puede leer tablas aunque un bug dejara pasar SQL arbitrario por ese camino
  (verificado: 42501 en `patients`, `team_members` y `sensitive.contacts`). Los logs de la app no guardan PII (errores como `nombre:código`).
- **Operación:** un solo proveedor y una sola facturación; el deploy pasa a ser `cdk deploy` + bundle de
  OpenNext. Se pierde el dashboard de Supabase: las consultas ad-hoc se hacen por el túnel SSM a la RDS.
- **Riesgo aceptado:** los roles `evzla_*` pueden abrir conexión a otras bases de la instancia por el
  `CONNECT` a `PUBLIC` por defecto, sin privilegios sobre sus objetos. No se modifica la base de Blockealo
  para cerrarlo.
- **Acoplamiento con Blockealo:** un mantenimiento o incidente de `blockealo-prod-db` afecta a
  EncuéntrameVzla; la base lógica separada permite moverla a su propia instancia con un dump/restore.
- **Reconciliación:** las herramientas de ADR-0008/0009 siguen en el repo, pero requieren restaurar el
  dump archivado antes de usarlas.
- **Documentación:** las specs y ADRs anteriores que describen Supabase quedan como registro histórico;
  la referencia vigente es este ADR, `docs/ARCHITECTURE.md` y `.claude/CLAUDE.md`.
