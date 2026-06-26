# Skill — Base de datos con Drizzle (`@evzla/db`)

Esquema Drizzle (schemas `public` / `sensible`) + cliente Postgres directo. Espejo en TS del SQL de
`supabase/migrations/`. **Las columnas SQL mandan**; Drizzle las refleja.

## Estructura del paquete

```
packages/db/src/
  schema/
    enums.ts      estadoEnum (estado_persona: ingresado|trasladado|alta|localizado|fallecido)
    public.ts     tablas NO sensibles: hospitales, staging_filas, personas, ingresos, busqueda_log...
    sensible.ts   PII/clínico: contactos, direcciones, observaciones (schema `sensible`)
    index.ts      re-export de enums + public + sensible
  client.ts       getDb() -> Drizzle sobre postgres.js (conexión directa)
  index.ts        export público del paquete
```

## Convención de tablas (Drizzle ↔ SQL)

- `pgTable("nombre_sql", { ... })`. Nombre de tabla/columna SQL en **español snake_case**
  (`telefono_mesa_info`, `nombre_normalizado`) — **no se renombran** (compatibilidad con migraciones).
- Propiedad TS en **camelCase** mapeada al nombre SQL: `telefonoMesaInfo: text("telefono_mesa_info")`.
- Tipos: `uuid().defaultRandom().primaryKey()`, `text()`, `text().array()` para `text[]`,
  `integer()`, `boolean().notNull().default(...)`, `jsonb()`,
  `timestamp("...", { withTimezone: true }).notNull().defaultNow()`.
- Claves foráneas: `.references(() => hospitales.id)`.

> Pendiente menor (de `specs/0001`): los identificadores Drizzle (consts y props) aún están en español;
> migrar a inglés es opcional y **no cambia las columnas SQL**. No lo hagas sin spec.

## Separación public / sensible

- `schema/public.ts` — todo lo que el sistema puede mostrar de forma mediada. Sin grants directos al anónimo.
- `schema/sensible.ts` — teléfonos, direcciones, observaciones clínicas. **Nunca** se consulta desde el
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
> revisa que el SQL resultante respete la separación public/sensible y la privacidad.

## Checklist

- [ ] ¿Columna SQL en snake_case español, prop TS en camelCase?
- [ ] ¿La tabla va en `public` o en `sensible` según sensibilidad?
- [ ] ¿No se importa el cliente directo desde componentes de cliente?
- [ ] ¿El cambio tiene su migración SQL correspondiente en `supabase/migrations/`?
