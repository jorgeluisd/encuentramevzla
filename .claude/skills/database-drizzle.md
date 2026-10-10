# Skill — Base de datos con Drizzle (`@evzla/db`)

Esquema Drizzle (schemas `public` / `sensitive`) + cliente Postgres directo. Espejo en TS del SQL de
`supabase/migrations/`. **Las columnas SQL mandan**; Drizzle las refleja.

## Estructura del paquete

```
packages/db/src/
  schema/
    enums.ts      statusEnum (person_status: admitted|transferred|discharged|located|deceased)
    public.ts     tablas NO sensibles: hospitals, raw_rows, patients, admissions, audit_log, search_log
    sensitive.ts  PII/clínico: contacts, clinical_notes (schema `sensitive`)
    index.ts      re-export de enums + public + sensitive
  client.ts       getDb() -> Drizzle sobre postgres.js (conexión directa)
  index.ts        export público del paquete
```

## Convención de tablas (Drizzle ↔ SQL)

- `pgTable("name_sql", { ... })`. Nombre de tabla/columna SQL en **inglés snake_case**
  (`info_desk_phone`, `normalized_name`).
- Propiedad TS en **camelCase** mapeada al nombre SQL: `infoDeskPhone: text("info_desk_phone")`.
- Tipos: `uuid().defaultRandom().primaryKey()`, `text()`, `text().array()` para `text[]`,
  `integer()`, `boolean().notNull().default(...)`, `jsonb()`,
  `timestamp("...", { withTimezone: true }).notNull().defaultNow()`.
- Claves foráneas: `.references(() => hospitals.id)`.

## Separación public / sensitive

- `schema/public.ts` — todo lo que el sistema puede mostrar de forma mediada. `evzla_public` no tiene grants sobre estas tablas.
- `schema/sensitive.ts` — teléfonos, direcciones, observaciones clínicas. **Nunca** se consulta desde el
  cliente; solo desde el servidor con `getDb('admin')`. No hay PostgREST: nunca agregues una vía directa.

## Cliente (`client.ts`)

- `getDb('admin' | 'public' | 'job')` — un cliente por rol, perezoso (se conecta en la primera query) y con
  `max: 1` (una Lambda atiende un request a la vez). En AWS lee `EVZLA_DB_SECRET_<ROL>` de Secrets Manager con
  TLS verify-full; en dev, `DATABASE_URL_<ROL>` o `DATABASE_URL`. Detalle de roles en `database.md`.
- **SOLO servidor**: nunca importar `@evzla/db/client` desde un componente de cliente. Lo usan ingesta,
  admin y workers; el público jamás.

## drizzle-kit (scripts del paquete)

- `pnpm --filter @evzla/db db:generate` — genera migraciones desde el schema.
- `pnpm --filter @evzla/db db:migrate` — aplica migraciones.
- `pnpm --filter @evzla/db db:studio` — explorador.

> El SQL de `supabase/migrations/` es la fuente de verdad operativa. Si generas con drizzle-kit,
> revisa que el SQL resultante respete la separación public/sensitive y la privacidad.

## Checklist

- [ ] ¿Columna SQL en snake_case inglés, prop TS en camelCase?
- [ ] ¿La tabla va en `public` o en `sensitive` según sensibilidad?
- [ ] ¿No se importa el cliente directo desde componentes de cliente?
- [ ] ¿El cambio tiene su migración SQL correspondiente en `supabase/migrations/`?
