# Skill — Scripts operativos y SQL one-off contra producción

Cómo correr scripts de base de datos (conteos, migraciones atómicas, verificación de RPC,
harness de test de SQL) de forma **segura** contra la Supabase de prod. Patrón recurrente y
lleno de gotchas; antes vivía disperso. Carga esta skill cuando la tarea implique ejecutar
Node/SQL directamente contra la DB (no el código de la app).

## Regla de oro: prod requiere OK explícito

- **Leer** (conteos, `SELECT`) es seguro, pero igual conecta a prod: avísalo.
- **Escribir / aplicar / verificar RPC** en prod exige **OK explícito del dueño nombrando prod**.
  El classifier bloquea si no se nombra. Nunca aplicar una migración o un `UPDATE`/`INSERT` a prod
  por iniciativa propia.

## Dónde y cómo

- Los scripts van en **`packages/db/scripts/`** — ahí resuelve `postgres` (postgres.js). Fuera de ese
  paquete la dependencia no está disponible.
- Cargar el `.env` de la **raíz** antes de correr:
  ```bash
  set -a; . ./.env; set +a
  node packages/db/scripts/<script>.mjs
  ```
- Conexión por el **pooler (puerto 6543)** → **`{ prepare: false }`** (pgbouncer en modo transacción):
  ```js
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  ```

## Patrones

- **Conteo / verificación (read-only):** `SELECT count(*)::int …`. Inofensivo. Cierra con `await sql.end()`.
- **Migración atómica:** envolver en **`BEGIN … COMMIT`** (un solo script `apply-NNNN.mjs`) para que no
  quede a medias. Con OK explícito de prod.
- **Test de SQL que Vitest no cubre (RPC/ingesta):** **harness Node en `packages/db` con transacción +
  `ROLLBACK`**. Corre contra el esquema real de prod, hace asserts y **nunca commitea** (descarta todo al
  final). Es la forma de "test primero" para lo que Strict TDD/Vitest no alcanza.

## Gotchas

- `max(timestamptz)` vía template `sql` vuelve **string** → coaccionar a `Date` en el lado JS.
- **PostgREST** resuelve una función con un argumento omitido si ese arg tiene **`DEFAULT`** → clave para
  desplegar un RPC nuevo **sin downtime** (la firma vieja sigue resolviendo).
- Los scripts one-off son **temporales**: bórralos tras usarlos (no se versionan salvo `apply-NNNN`/`verify-NNNN`).
- Nunca subir `.env` ni `draw/` (Excel real).

## Privacidad

Estos scripts tienen credenciales de servidor y pueden tocar el schema `sensitive`. Si el script lee/mueve
PII, carga también `privacy-and-security.md`. Jamás imprimir PII en logs.
