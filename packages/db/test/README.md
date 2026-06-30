# Tests de BD (Postgres local, de usar y tirar)

Validan SQL real (RPC, índices, dedup) contra un Postgres en Docker. **Nunca tocan prod.**

## Levantar el Postgres de test

```bash
docker run -d --name evzla-pg-test \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=evzla_test \
  -p 54322:5432 postgres:16-alpine
```

Conexión por defecto: `postgresql://postgres:postgres@localhost:54322/evzla_test`
(override con `TEST_DATABASE_URL`).

## Correr

```bash
# Golden del buscador (spec 0018): la semántica NO debe cambiar entre 0008 y 0011.
node packages/db/test/search.golden.mjs 0008   # línea base (función actual)
node packages/db/test/search.golden.mjs 0011   # nueva (debe dar idéntico)

# EXPLAIN: el WHERE nuevo usa el índice GIN trigram; el viejo hace Seq Scan.
node packages/db/test/explain-check.mjs
```

`local-db.mjs` carga el esquema mínimo (0001 + 0007 + la función elegida) y siembra
datos deterministas. Cada corrida hace `DROP SCHEMA public CASCADE` y recrea desde cero.

## Limpiar

```bash
docker rm -f evzla-pg-test
```
