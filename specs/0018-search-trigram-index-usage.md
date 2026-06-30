# Spec 0018 — RPC `search_patient` que use el índice trigram

Estado: **propuesto** (pendiente Gate 1) · Capacidad: `patient-search`
Relacionado: spec 0005 (buscador), spec 0012 (multitoken), spec 0016 (anti-abuso), migración 0009 (índices).
Origen: auditoría de rendimiento (2026-06-29). El `WHERE` actual del RPC **no puede usar** el índice
GIN trigram, así que cada búsqueda hace *seq scan* de `patients ⨝ admissions`. Con dataset pequeño no
se nota; a escala (decenas de miles de pacientes) quema CPU de Supabase en cada búsqueda pública.

## 1. Motivación

El cuerpo de `public.search_patient` (migración 0008) filtra así:

```sql
WHERE h.active = true
  AND (
    (v_doc_norm IS NOT NULL AND p.normalized_doc_number = v_doc_norm)
    OR NOT EXISTS (
      SELECT 1 FROM unnest(v_tokens) AS tok
      WHERE p.normalized_name NOT ILIKE '%' || tok || '%'
        AND word_similarity(tok, p.normalized_name) < 0.6
    )
  )
```

`word_similarity()` y el `NOT ILIKE` van **negados dentro de un `NOT EXISTS`**, una forma que el planner
no puede resolver con el índice `idx_patients_normalized_name_trgm` (GIN, `gin_trgm_ops`). Resultado:
**Seq Scan** de `patients` (con el JOIN a `admissions`) en cada búsqueda. El índice existe pero queda muerto.

## 2. Alcance

- **Que el buscador use el índice GIN trigram** (pasar de *Seq Scan* a *Bitmap Index Scan*), **sin
  cambiar qué pacientes devuelve** (mismos resultados, mismo orden).

Fuera de alcance: cambiar el ranking/score, el rate-limit, el contrato de privacidad (0015), o tocar
la rama de cédula (ya es igualdad exacta indexable con `idx_patients_normalized_doc_number`).

## 3. Decisiones (Gate 1 — pendientes de aprobación del dueño)

- **D1. Pre-filtro positivo indexable por token.** Reescribir el matching de nombre para que cada token
  exija una condición que el GIN trigram **sí** acelera:
  `p.normalized_name ILIKE '%'||tok||'%'  OR  tok <% p.normalized_name`
  - `ILIKE '%tok%'` con `gin_trgm_ops` usa el índice para patrones ≥ 3 caracteres.
  - `<%` es el operador de `word_similarity` y usa el índice; su umbral por defecto
    (`pg_trgm.word_similarity_threshold = 0.6`) **coincide** con el `< 0.6` actual → semántica alineada.
- **D2. AND por token preservado.** Un paciente matchea si **todos** los tokens cumplen D1 (igual que hoy:
  `NOT EXISTS(token que falla)` ≡ "todos pasan"). Se mantiene el refinamiento exacto para no ampliar ni
  reducir el conjunto.
- **D3. Equivalencia verificada por tests "golden"** (ver §5), no por inspección. Si no se logra
  resultado idéntico **y** uso de índice, **se detiene y se reporta** (no se cambia la semántica a ciegas).

## 4. Diseño

Nueva migración `0011_search_patient_trigram.sql` con `CREATE OR REPLACE FUNCTION` (un solo statement,
atómico) que cambia **solo** la cláusula de matching de nombre. El score/orden, el rate-limit, el
logging y la rama de cédula quedan **idénticos**. La forma objetivo del predicado de nombre:

```sql
NOT EXISTS (
  SELECT 1 FROM unnest(v_tokens) AS tok
  WHERE NOT ( p.normalized_name ILIKE '%'||tok||'%' OR tok <% p.normalized_name )
)
```

(equivalente lógico al actual, pero con operadores indexables) — se valida con `EXPLAIN ANALYZE` que el
planner elige *Bitmap Index Scan* sobre `idx_patients_normalized_name_trgm`. Si hiciera falta, se fuerza
`SET LOCAL pg_trgm.word_similarity_threshold = 0.6` dentro de la función para fijar el umbral.

## 5. Plan de tests (TDD — rojo primero)

Entorno: **Postgres 16 local** (Docker, de usar y tirar), migraciones 0001→0011, datos semilla con casos
reales. Se introduce un harness de test SQL en `packages/db/test/`.

Casos "golden" que fijan la semántica ACTUAL (deben pasar idénticos antes y después):
1. `"jorge diaz"` **no** trae `"julio diaz"` ni `"jorge suarez"` (bug histórico ya corregido).
2. Match exacto por cédula (con/sin guiones, ≥ 6 dígitos).
3. Insensible a acentos (`"jose"` ↔ `"josé"`).
4. AND multi-token: `"ana maria"` exige ambos tokens.
5. Token con typo dentro de umbral (`<%` ≥ 0.6) sí matchea; por debajo, no.
6. `LIMIT 10` y orden por confianza intactos.

Además: test que ejecuta `EXPLAIN (ANALYZE, FORMAT JSON)` y **asegura** que el plan contiene un índice
(no `Seq Scan`) sobre `patients`.

## 6. Aplicación a producción

Migración + `apply-0011.mjs` (patrón 0007/0008). **A prod SOLO con OK explícito** nombrando prod, tras
verde local + `EXPLAIN` confirmando el índice.

## 7. Riesgos

- **Cambio de resultados del buscador = privacidad.** Mitigado por los golden tests (bloquean cualquier
  diferencia). Si aparece divergencia, se aborta.
- `ILIKE '%x%'` con tokens < 3 chars no usa índice; el `length(v_term_norm) < 4` ya filtra términos cortos,
  pero un token suelto de 1-2 letras dependería del `<%`. Se cubre con un caso de test.
