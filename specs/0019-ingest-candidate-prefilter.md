# Spec 0019 — Ingesta: prefiltrar candidatos en vez de `loadAll()`

Estado: **propuesto** (pendiente Gate 1) · Capacidad: `patient-registry`
Relacionado: spec 0002 (deduplicación), ADR-0003, spec 0017 (ingesta robusta), migración 0009 (índices).
Origen: auditoría de rendimiento (2026-06-29). La ingesta hace `repos.patients.loadAll()` —un
`SELECT` de **toda** la tabla `patients`— y la carga en RAM de Node para deduplicar. A escala es
egress + memoria altos y riesgo de OOM en la función serverless.

## 1. Motivación

`IngestPatientList` (en `@evzla/core`) deduplica **en memoria** con `decideMatch`, comparando cada fila
nueva contra `candidates`. Hoy `candidates` se obtiene con `loadAll()` (toda la tabla):

```ts
const candidates: ExistingPatient[] = (await repos.patients.loadAll()).map(...);
```

Con 100k pacientes, cada ingesta descarga 100k filas a Node (decenas de MB) aunque el lote traiga 50.
El cuello **no** es el algoritmo (es barato en memoria), sino **traer todo el universo** para comparar.

## 2. Alcance

- Sustituir `loadAll()` por una **carga acotada de candidatos** relevantes al lote, **sin cambiar la
  decisión de dedup** (mismos merges/inserts/conflictos que hoy).
- **Respetar onion:** `decideMatch` (servicio de dominio puro) **no se mueve a SQL** ni cambia.

Fuera de alcance: cambiar las reglas de `decideMatch`, el merge manual (0010), o el flujo de revisión.

## 3. Decisiones (Gate 1 — pendientes de aprobación del dueño)

- **D1. Nuevo método de port `loadCandidates(keys)`** en `PatientRepository`, que recibe del lote: el
  conjunto de **cédulas normalizadas** y el conjunto de **nombres normalizados** (o sus tokens).
- **D2. El adapter Drizzle resuelve el prefiltro en SQL indexado:**
  `WHERE normalized_doc_number IN (:docs)  OR  normalized_name % ANY(:names)`
  - `normalized_doc_number IN (...)` usa `idx_patients_normalized_doc_number` (migración 0009).
  - `name % ANY(...)` (operador de similitud trigram) usa `idx_patients_normalized_name_trgm`.
- **D3. Corrección por construcción: el prefiltro es SUPERCONJUNTO de lo que `decideMatch` podría
  fusionar.** `decideMatch` fusiona por (a) cédula igual o (b) nombre suficientemente similar. El
  prefiltro D2 trae exactamente esos dos universos, así que **ningún match posible se pierde**. Lo que
  sobre-traiga lo descarta `decideMatch` igual que hoy → resultado idéntico.
- **D4. `loadAll()` se conserva** mientras haya un consumidor; si queda huérfano, se elimina en el mismo PR.

## 4. Diseño

- **core:** añadir `loadCandidates(keys: { docs: string[]; names: string[] }): Promise<ExistingPatient[]>`
  al port; `IngestPatientList` construye `keys` desde `toProcess` y llama `loadCandidates` en lugar de
  `loadAll`. El resto (grafo en memoria, acumuladores, persistencia bulk) **no cambia**.
- **infra (apps/web):** implementar `loadCandidates` en `DrizzlePatientRepository` con el `WHERE` de D2.
  Cuidar el límite de parámetros del driver: trocear `docs`/`names` en lotes (como el `BATCH=500` de
  inserts) y unir resultados (dedup por id).
- **umbral de similitud:** fijar `pg_trgm.similarity_threshold` coherente con `decideMatch` para que el
  `%` no recorte candidatos que el dominio sí consideraría; se valida con tests (§5).

## 5. Plan de tests (TDD — rojo primero)

- **core (unit, con repo fake):** los tests de `ingest-patient-list.test.ts` siguen verdes; se añaden
  casos que afirman que se llama `loadCandidates(keys)` con las cédulas/nombres del lote (no `loadAll`).
- **integración (Postgres local):** sembrar pacientes existentes y verificar que:
  1. un duplicado por **cédula** se fusiona;
  2. un duplicado alcanzable **solo por similitud de nombre** (sin cédula) se fusiona (no se duplica la
     persona) → prueba que el prefiltro no se lo pierde;
  3. un homónimo que `decideMatch` mandaría a revisión sigue yendo a revisión;
  4. el resultado (counts de `IngestionSummary`) es idéntico al de `loadAll()` para el mismo dataset.

## 6. Riesgos

- **Corrección del dedup = seguridad** (fusionar dos personas distintas, o no fusionar una). Mitigado por
  D3 (superconjunto) + los tests de integración 1-4. Si un test muestra divergencia con `loadAll`, se
  aborta y se reporta.
- Lotes con miles de nombres distintos → `% ANY(:names)` grande; se trocea y se mide.
