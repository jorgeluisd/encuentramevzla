# 0002 — Deduplicación de pacientes (dominio)

Estado: en progreso · Capa: `patient-registry/domain` · Dirige el TDD de este incremento.

## Contexto (datos reales)

337 pacientes / 5 hospitales. Hallazgos: 50% sin cédula, cédulas basura ("22.89"),
**cédulas iguales con personas distintas**, nombres con orden apellido/nombre variable y
extranjeros. → El matching no puede confiar en la cédula como clave única.

## Value objects

### `PersonName`
- `fromRaw(raw)` normaliza: sin acentos, minúsculas, sin puntuación, espacios colapsados.
- `tokens`: conjunto de tokens **ordenado** (token-set) para tolerar el orden de palabras.
- `isEmpty` true si el normalizado queda vacío.

**Criterios:**
- `fromRaw("Pérez Júan").normalized === "perez juan"`.
- `fromRaw("Juan Pérez").tokens` igual a `fromRaw("Pérez Juan").tokens` → `["juan","perez"]`.
- `fromRaw("   ").isEmpty === true`.

### `DocumentId`
- `fromRaw(raw)` normaliza a alfanumérico en mayúsculas.
- `isValid` solo si tiene **≥ 6 dígitos** (descarta basura como "22.89").

**Criterios:**
- `fromRaw("24.140.952").normalized === "24140952"` y `isValid === true`.
- `fromRaw("22.89").isValid === false`.
- `fromRaw("").isValid === false`.

## Servicios de dominio (similitud)

`levenshtein`, `trigrams`, `trigramSimilarity`, `tokenSetSimilarity` — funciones puras en [0,1]
(token-set sobre arreglos de tokens). Espejo en app de `pg_trgm` / `fuzzystrmatch`.

**Criterios:**
- `levenshtein("kitten","sitting") === 3`; iguales → 0.
- `trigramSimilarity(x,x) === 1`; disjuntos → bajo.
- `tokenSetSimilarity(["a","b"],["b","a"]) === 1` (orden-insensible); disjuntos → 0.

## Política de decisión (siguiente incremento: application)

- Cédula válida + nombre concuerda (≥ 0.5) → **merge**.
- Misma cédula + nombre distinto → **conflict** (no fusiona; revisión humana).
- Sin cédula: nombre ≥ 0.92 → **merge**; 0.80–0.92 → **review**; resto → **new**.
- **Cédulas válidas DISTINTAS** (aunque el nombre sea ≥ 0.92): la cédula que no coincide es señal de
  **persona distinta**, el nombre solo no alcanza. Según cuánto difieran (distancia de edición):
  **≤ 2 dígitos** (posible typo) → **review**; **> 2** → **new** (separadas, sin revisión). Si solo uno
  de los dos tiene cédula, no bloquea: sigue mandando el nombre.
- **Mismo nombre SIN cédula (ninguno la tiene), por hospital:** **mismo hospital** → **merge**;
  **hospital distinto** → **new** (no fusiona). Sin cédula, "mismo nombre en otro hospital" es ambiguo
  (traslado real vs homónimo); separarlas no miente y la búsqueda por nombre igual muestra ambas. El
  matching recibe el hospital del registro y los hospitales del candidato (derivados de `admissions`).
