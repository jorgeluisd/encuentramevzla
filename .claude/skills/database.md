# Skill — Base de datos (RDS PostgreSQL 18, roles `evzla_*`, RPC mediados)

Desde el 2026-10-09 la base es la lógica `encuentramevzla` en la instancia RDS `blockealo-prod-db`
(PostgreSQL 18, privada, `sa-east-1`, TLS obligatorio). Ver `adr/0010-migracion-supabase-vercel-a-aws.md`.
**No hay PostgREST**: el navegador nunca habla con la base; todo pasa por el servidor (Next.js en Lambda).

## Schemas y extensiones

- `public` (datos no sensibles + RPC), `sensitive` (teléfonos, direcciones, notas clínicas), `extensions`
  (`pgcrypto`, `uuid-ossp`). `pg_trgm`, `unaccent` y `fuzzystrmatch` viven en `public`.
- Los RPC fijan `SET search_path = public, extensions`.

## Roles (mínimo privilegio)

| Rol | Uso | Permisos |
|---|---|---|
| `evzla_owner` | migraciones, dueño de objetos | todo sobre la base |
| `evzla_admin` | `/admin`, ingesta, exportes, revisión, equipo, servicios | USAGE public+sensitive, DML en todas las tablas, secuencias |
| `evzla_public` | buscador y directorio público | **solo** EXECUTE `search_patient(text,text)` y `list_solidarity_services(text,text)` |
| `evzla_job` | purga diaria | **solo** EXECUTE `purge_search_log()` |

- Credenciales en **Secrets Manager**: `evzla/db/owner`, `evzla/db/admin`, `evzla/db/public`, `evzla/db/job`
  (JSON `host`, `port`, `dbname`, `username`, `password`). Nunca en el repo.
- Los roles, grants y `purge_search_log()` los crean los scripts de la migración (`draft/aws-migration/`,
  no versionado). Si cambias un grant, refléjalo también ahí y en este archivo.
- Antes de añadir un `GRANT`, pregúntate: ¿esto abre datos al público? `evzla_public` **nunca** recibe
  SELECT sobre tablas ni USAGE sobre `sensitive`.

## Cliente en la app (`@evzla/db`)

- `getDb('admin' | 'public' | 'job')`: un cliente Drizzle (postgres.js) por rol, **1 conexión** por Lambda,
  creado en la primera query. En AWS lee `EVZLA_DB_SECRET_<ROL>`; en dev, `DATABASE_URL_<ROL>` o `DATABASE_URL`.
- TLS **verify-full** con el CA del runtime de Lambda (`NODE_EXTRA_CA_CERTS`). No desactives la verificación.
- Camino público → `getDb('public')` (adapters `DrizzlePatientSearchGateway`, `DrizzleSolidarityServiceDirectory`).
  Todo lo demás → `getDb('admin')`.
- **Logs:** el mensaje de error de Drizzle incluye los parámetros de la query. Loggea solo `safeErrorTag(error)`.

## Migraciones SQL (`supabase/migrations/`, nombre heredado)

- Nombre `NNNN_descripcion.sql`, incremental de 4 dígitos. Se aplican con `evzla_owner` (túnel SSM a la RDS).
- **Idempotentes** donde se pueda (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- El SQL manda; Drizzle refleja las columnas (`database-drizzle.md`).
- Toda migración que toque datos o búsqueda pasa por `privacy-and-security.md` y el Gate 1.

## RPC mediado `public.search_patient(term, client_hash)`

Único punto de entrada del público a los pacientes. Al editarlo:

- `LANGUAGE plpgsql` · `SECURITY DEFINER` · `SET search_path = public, extensions` (obligatorio).
- Término normalizado (`lower(unaccent(...))`) de al menos 4 caracteres → si no, `{ invalid_term: true }`.
- Rate-limit por `client_hash` (hash de IP) → `{ rate_limited: true }`.
- Devuelve `{ hospital_name, info_desk_phone, patient_name, confidence }`, también para menores y
  fallecidos (ADR-0003). Nunca teléfonos, direcciones, cédula ni notas.
- Registra el **hash** del término en `search_log`, nunca el texto. La purga (> 90 días) la corre
  EventBridge Scheduler → Lambda con `evzla_job`.

## Directorio público `public.list_solidarity_services(category, q)`

- `SECURITY DEFINER`; solo servicios aprobados y vigentes; nunca email ni token de gestión.

## Checklist al tocar SQL/RPC

- [ ] ¿Migración `NNNN_*.sql` incremental e idempotente?
- [ ] ¿El RPC sigue `SECURITY DEFINER` con `search_path` fijo?
- [ ] ¿Devuelve solo el contrato mediado?
- [ ] ¿`search_log` solo con hash?
- [ ] ¿Ningún grant nuevo a `evzla_public` sobre tablas o `sensitive`?
- [ ] ¿El rol que usa la app para esta operación es el mínimo (`public` vs `admin`)?
