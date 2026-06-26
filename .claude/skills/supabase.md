# Skill — Supabase (Postgres 16, RLS, RPC, Edge Functions)

**No hay backend propio: todo es Supabase.** El frontend habla directo con Supabase: el público solo
invoca el RPC mediado `buscar_paciente`; la ingesta usa Server Actions con la service role.

## Migraciones SQL (`supabase/migrations/`)

- Nombre: `NNNN_descripcion.sql` con `NNNN` incremental de 4 dígitos. Estado actual: `0001`..`0006`.
  - `0001_init` — extensiones (`pg_trgm`, `fuzzystrmatch`, `unaccent`), schemas, tablas, enum `estado_persona`.
  - `0002_rls` — RLS y grants (rol anónimo SIN acceso directo a tablas).
  - `0003_rpc_buscar_paciente` — RPC público mediado.
  - `0004_buscar_paciente_umbral` — ajuste de umbral de matching.
  - `0005_buscar_paciente_rowcount_fix` — fix bug `ROW_COUNT` vs boolean (ver `engram/seeds.md`).
  - `0006_buscar_paciente_por_cedula` — búsqueda por cédula.
- Cada migración es **idempotente** donde se pueda (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Toda migración que toque datos/búsqueda pasa por `privacy-and-security.md` y el Gate 1.

## RPC mediado `public.buscar_paciente(termino)`

Es el **único** punto de entrada del público a los datos. Reglas obligatorias al editarlo:

- `LANGUAGE plpgsql` · `SECURITY DEFINER` · `SET search_path = public, extensions`
  (fijar `search_path` es **obligatorio** en `SECURITY DEFINER`).
- Valida el término (mínimo 4 caracteres normalizados).
- Normaliza con `lower(unaccent(...))` + colapso de espacios; matching con `pg_trgm`/`fuzzystrmatch`.
- Devuelve SOLO `{ hospital_nombre, hospital_telefono_mesa, confianza }` (modelado como `jsonb`).
- Menor/fallecido → `{ requiere_contacto_humano: true }`, nunca datos.
- Registra **hash** del término en `busqueda_log` (`encode(digest(..., 'sha256'), 'hex')`), nunca el texto.
- Mantén el `TODO(rate-limit)` hasta implementarlo (chequeo por IP/ventana antes de seguir).

## RLS y grants (`0002_rls`)

- El rol anónimo (`anon`) **no tiene grants** sobre tablas de datos ni sobre el schema `sensible`.
- El acceso público se concede **solo a la función** `buscar_paciente` (EXECUTE), no a tablas.
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
- [ ] ¿`busqueda_log` solo con hash?
- [ ] ¿Ningún grant nuevo al rol anónimo sobre datos/sensible?
