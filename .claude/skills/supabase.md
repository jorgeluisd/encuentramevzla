# Skill — Supabase (Postgres 16, RLS, RPC, Edge Functions)

**No hay backend propio: todo es Supabase.** El frontend habla directo con Supabase: el público solo
invoca el RPC mediado `search_patient`; la ingesta usa Server Actions con la service role.

## Migraciones SQL (`supabase/migrations/`)

- Nombre: `NNNN_descripcion.sql` con `NNNN` incremental de 4 dígitos. Estado actual: `0001`..`0003`.
  - `0001_init` — extensiones (`pg_trgm`, `fuzzystrmatch`, `unaccent`), schemas, tablas, enum `person_status`.
  - `0002_rls` — RLS y grants (rol anónimo SIN acceso directo a tablas).
  - `0003_rpc_search_patient` — RPC público mediado (matching por nombre o cédula; nombres de adultos).
- Cada migración es **idempotente** donde se pueda (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Toda migración que toque datos/búsqueda pasa por `privacy-and-security.md` y el Gate 1.

## RPC mediado `public.search_patient(term)`

Es el **único** punto de entrada del público a los datos. Reglas obligatorias al editarlo:

- `LANGUAGE plpgsql` · `SECURITY DEFINER` · `SET search_path = public, extensions`
  (fijar `search_path` es **obligatorio** en `SECURITY DEFINER`).
- Valida el término (mínimo 4 caracteres normalizados).
- Normaliza con `lower(unaccent(...))` + colapso de espacios; matching con `pg_trgm`/`fuzzystrmatch`.
- Para adultos vivos devuelve `{ hospital_name, info_desk_phone, patient_name, confidence }` (jsonb),
  agrupado por hospital.
- Menor/fallecido → `{ requires_human_contact: true }`, nunca datos.
- Registra **hash** del término en `search_log` (`encode(digest(..., 'sha256'), 'hex')`), nunca el texto.
- Mantén el `TODO(rate-limit)` hasta implementarlo (chequeo por IP/ventana antes de seguir).

## RLS y grants (`0002_rls`)

- El rol anónimo (`anon`) **no tiene grants** sobre tablas de datos ni sobre el schema `sensitive`.
- El acceso público se concede **solo a la función** `search_patient` (EXECUTE), no a tablas.
- Antes de añadir un `GRANT`, pregúntate: ¿esto abre datos al público? Si sí, reconsidéralo.

## Edge Functions (`supabase/functions/`) — Deno

- `dedup/index.ts` — worker pesado de dedup/OCR de la **fase 2** (hoy stub). Runtime **Deno**
  (imports por URL, `Deno.serve`), no Node. No mezclar dependencias de Node aquí.

## Clientes (lado servidor vs público)

- **Público**: `apps/web/lib/supabase/anon.ts` con la **anon key** → solo invoca el RPC.
- **Servidor/ingesta/admin**: conexión **directa** a Postgres vía Drizzle (`@evzla/db` `getDb()`,
  `DATABASE_URL`, `prepare:false` por el pooler pgbouncer). El público jamás usa este cliente.

## Checklist al tocar SQL/RPC

- [ ] ¿Nueva migración `NNNN_*.sql` incremental e idempotente?
- [ ] ¿El RPC sigue `SECURITY DEFINER` con `search_path` fijo?
- [ ] ¿Devuelve solo el contrato mediado? ¿Menores/fallecidos excluidos?
- [ ] ¿`search_log` solo con hash?
- [ ] ¿Ningún grant nuevo al rol anónimo sobre datos/sensitive?
