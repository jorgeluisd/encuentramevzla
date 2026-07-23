# Runbook — Reconciliación de fuente consolidada (ADR-0008)

Pipeline de **diagnóstico** (no ejecuta reemplazo ni fusión). Cruza un `.xlsx` consolidado contra
producción y produce un reporte cuantificado en `docs/reports/`. Todo vive en el esquema aislado
`reconciliation` y se revierte por completo con `DROP SCHEMA reconciliation CASCADE`.

## Restricciones duras
- **Cero mutación** de tablas preexistentes (`public` / `sensitive`). El pipeline es solo lectura sobre ellas.
- El staging vive en `reconciliation` (esquema nuevo, aislado, droppable).
- Idempotente por `run_id`; re-ingerir el mismo archivo aborta salvo `--force`.

## Paso 0 — OBLIGATORIO antes de cualquier escritura sobre PROD: pg_dump verificado

```bash
# 1) Respaldo comprimido de prod
pg_dump "$DATABASE_URL" -Fc -f backup_prod_$(date +%Y%m%d_%H%M).dump

# 2) VERIFICAR el respaldo restaurándolo en una base local temporal
createdb evzla_dump_check
pg_restore -d evzla_dump_check backup_prod_YYYYMMDD_HHMM.dump   # sin errores
psql evzla_dump_check -c "select count(*) from public.patients;" # sanity check
dropdb evzla_dump_check
```

El CLI **bloquea** toda escritura sobre una base remota/PROD hasta que pases `--i-have-a-verified-dump`.
Sobre local (`127.0.0.1`) no hace falta.

## Paso 1 — Correr el diagnóstico

```bash
# Desarrollo/ensayo contra Supabase local (docker):
DATABASE_URL=postgres://...127.0.0.1:54322/postgres \
  pnpm --filter @evzla/db reconcile all --file "/ruta/al/01-Lista digitalizada ....xlsx"

# Contra PROD (tras el pg_dump verificado):
DATABASE_URL="$PROD_URL" \
  pnpm --filter @evzla/db reconcile all --file "/ruta/....xlsx" --i-have-a-verified-dump
```

Subcomandos individuales (encadenables por `run_id`):

```bash
pnpm --filter @evzla/db reconcile ingest    --file <ruta.xlsx> [--force]   # imprime run_id
pnpm --filter @evzla/db reconcile reconcile --run-id <uuid>
pnpm --filter @evzla/db reconcile report    --run-id <uuid>                # solo lectura → docs/reports/
```

## Paso 2 — Revisar el reporte
`docs/reports/reconciliation-<run_id>-<fecha>.md`. Empezá por **ONLY_IN_PRODUCTION** (sección crítica):
son pacientes que un reemplazo ciego borraría. El reporte contiene nombres internos: **no se publica**.

## Paso 3 — Revertir (siempre disponible, sin efecto sobre prod)
```sql
DROP SCHEMA reconciliation CASCADE;
```
