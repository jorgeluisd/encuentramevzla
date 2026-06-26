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

- `schema/public.ts` — todo lo que el sistema puede mostrar de forma mediada. Sin grants directos al anónimo.
- `schema/sensitive.ts` — teléfonos, direcciones, observaciones clínicas. **Nunca** se consulta desde el
  cliente; solo por conexión directa de servidor. No expongas estas tablas vía PostgREST/supabase-js.

## Cliente (`client.ts`)

- `getDb()` — singleton perezoso. Requiere `DATABASE_URL`. `postgres(url, { prepare:false, max:5 })`
  (`prepare:false` por el pooler de Supabase / pgbouncer en modo transacción).
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
