# Skill — Scripts operativos y SQL one-off contra producción

Cómo correr scripts de base de datos (conteos, migraciones atómicas, verificación de RPC,
harness de test de SQL) de forma **segura** contra la base de prod (RDS `encuentramevzla`). Patrón recurrente y
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
- La RDS es privada: se llega por un **túnel SSM** a `127.0.0.1:15432` (script `draft/aws-migration/00-tunnel.sh`).
  Las credenciales salen de Secrets Manager (`evzla/db/owner` para migraciones, `evzla/db/admin` para datos).
- Cargar el `.env` de la **raíz** antes de correr:
  ```bash
  set -a; . ./.env; set +a
  node packages/db/scripts/<script>.mjs
  ```
- Conexión directa (no hay pooler) con TLS (`sslmode=require` por el túnel; el certificado es el de RDS):
  ```js
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
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
- Un argumento con **`DEFAULT`** permite agregar parámetros a un RPC **sin downtime**: las llamadas con la
  firma vieja siguen resolviendo. Al cambiar la firma, reaplica el `GRANT EXECUTE` a `evzla_public`/`evzla_admin`.
- Los scripts one-off son **temporales**: bórralos tras usarlos (no se versionan salvo `apply-NNNN`/`verify-NNNN`).
- Nunca subir `.env` ni `draft/` (Excel real).

## Privacidad

Estos scripts tienen credenciales de servidor y pueden tocar el schema `sensitive`. Si el script lee/mueve
PII, carga también `privacy-and-security.md`. Jamás imprimir PII en logs.
