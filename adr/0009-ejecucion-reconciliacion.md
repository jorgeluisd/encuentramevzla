# ADR-0009 — Ejecución de la reconciliación (aplicar el diagnóstico a prod)

Fecha: 2026-07-23 · Estado: **borrador (pendiente de "acepto")** · Extiende: [[ADR-0008]] (diagnóstico), [[ADR-0004]] (matching conservador), [[ADR-0007]] (remediación reversible), spec 0009 (cola de revisión), spec 0010 (fusión).

> ADR-0008 **diagnosticó**; este ADR **ejecuta**: lleva el valor del Excel consolidado a producción
> **sin perder prod** y sin filtrar datos sensibles. Lee del esquema `reconciliation` ya poblado
> (`run_id dedc32e8…`). Toda escritura es **auditada, reversible y con `pg_dump` previo**.

## Contexto

El diagnóstico (ADR-0008) dejó en prod, dentro del esquema aislado `reconciliation`, 9.223 registros de
staging clasificados: `ONLY_IN_SOURCE` 5.333, `MATCH_IDENTICAL` 2.703, `MATCH_CONFLICT` 1.187,
`ONLY_IN_PRODUCTION` 4.476, `DUP_IN_SOURCE` 2.671 (3.858 a revisión). El crudo del Excel está íntegro en
`reconciliation.staging_patient_record.raw`. La decisión fue **reconciliar, no reemplazar**.

Ejecutar significa cuatro operaciones distintas por categoría, ninguna destructiva sobre lo existente.

## Decisión

Cuatro políticas (confirmadas con Jorge, 2026-07-23):

1. **`ONLY_IN_SOURCE` (5.333) → importar TODOS vía el motor de dedup existente.** No un importador a
   medida: se reconstruye un `ParsedPatientList` desde el staging y se pasa por **`IngestPatientList`**
   (spec 0017/0020). Así heredan dedup, resolución de hospital (catálogo+alias, ya con los 5 alias nuevos),
   menor/fallecido, escritura de `sensitive`, y **re-verificación contra prod**: los que el bloqueo del
   diagnóstico no captó se **fusionan** en vez de duplicarse. `content_hash` de `raw_rows` da idempotencia.
2. **`MATCH_IDENTICAL` / `MATCH_CONFLICT` → enriquecer SOLO campos vacíos.** Donde prod tiene el campo en
   `NULL`, se completa desde el Excel (cédula, edad, sexo; teléfono/dirección → `sensitive.contacts`;
   patologías/observaciones → `sensitive.clinical_notes`). **Nunca se pisa un valor existente.** Auditado.
3. **Procedencia → se aplica ahora (migración aditiva).** Todo lo importado/enriquecido queda tagueado:
   `source = consolidado-2026-07-23`, `ingest_batch_id`, `run_id`. Hace la fase **reversible por lote** y
   responde "de dónde salió cada registro" (cierra el hueco de [[ADR-0008]]).
4. **Conflictos y alertas (3.858) → cola de revisión humana en `/admin` (spec 0009).** Se enrutan como
   entradas `dedup_*` de `audit_log`; el moderador resuelve caso a caso con `ResolveReviewCase` +
   `MergePatients`. Reusa la infraestructura existente; los `DUP_IN_SOURCE` se colapsan al importar.

`ONLY_IN_PRODUCTION` (4.476): **no se toca** — es lo que la reconciliación protege.

## Arquitectura (reúso, no reinvención)

- **Fuente de verdad de la ejecución:** el esquema `reconciliation` (determinista, re-ejecutable por `run_id`).
- **Importación:** un caso de uso nuevo `ApplyReconciliation` (aplicación, `@evzla/core`) que, por cada
  grupo de duplicados intra-staging, elige un representante (colapsa `DUP_IN_SOURCE`), arma
  `ParsedPatientList` desde `staging.raw` y delega en **`IngestPatientList`** (reusa TODO su dedup/persistencia).
- **Enriquecimiento:** caso de uso `EnrichFromSource` con un port `PatientEnricher.fillMissing(...)` cuyo
  adapter hace `UPDATE ... SET campo = COALESCE(campo, :nuevo)` (fill-only) + `INSERT` en `sensitive`
  cuando falte, todo dentro de una transacción y con entrada en `audit_log`.
- **Conflictos:** `EnqueueReconciliationConflicts` escribe `audit_log` (`dedup_document_conflict` /
  `dedup_pending_review`, o una acción nueva `reconcile_conflict`) → aparecen en la cola `/admin` existente.
- **Fusión de decisiones humanas:** `MergePatients` (spec 0010), sin cambios.

## Modelo de procedencia (migración 0020, aditiva)

```
public.ingest_batch(id uuid pk, source_file_name text, source_file_hash text, kind text,
                    actor_id uuid, run_id uuid, created_at timestamptz)
public.patient_provenance(patient_id uuid → patients.id, ingest_batch_id uuid → ingest_batch.id,
                          source_kind text, source_ref text, created_at timestamptz)
```
Additiva (solo `CREATE TABLE`/`ADD`), sin tocar datos existentes. Poblada al importar/enriquecer. Permite
deshacer un lote entero (`ingest_batch_id`) y auditar el origen sin re-hacer matching en el futuro.

## Tratamiento de las 14 columnas sensibles de `Refugio Oeste` (validado con `privacy-and-security`)

Mapeo definitivo (todas van a `sensitive`, **jamás a `public`** ni al buscador):
- `TELÉFONO`, `TELÉFONO DE EMERGENCIA` → `sensitive.contacts.phone`.
- `ESTADO/MUNICIPIO/PARROQUIA/SECTOR/COMUNA` → `sensitive.contacts.address` (compuesto).
- `PATOLOGÍAS`, `MOTIVO DE REFUGIO`, `NECESIDADES BÁSICAS`, `OBSERVACIONES ADICIONALES`,
  `PERTENENCIAS`, `TOTAL INTEGRANTES`, `GRUPO FAMILIAR` → `sensitive.clinical_notes.note` (contexto).
- El buscador sigue devolviendo solo hospital + mesa de información (regla dura 2 de la skill).

**Safeguard de menores (crítico).** `IngestPatientList` deriva `is_minor` solo de la edad o de la palabra
"menor" en el nombre. Pero el staging capturó menores por **centinela de cédula** (`INFANTE`, `[Menor]`,
`MENOR`) que NO están en el nombre. La ejecución DEBE **propagar `staging.is_minor`** al import (nuevo campo
`isMinor?` en `ParsedPatientRow`, OR con el cálculo actual) para que ningún menor quede con nombre expuesto
en el buscador (regla dura 3). Sin esto, un `INFANTE` sin edad se publicaría — inaceptable.

Checklist de privacidad (Gate 2) para F1/F2: ninguna de las 14 columnas toca `public`; el público sigue
solo por `search_patient`; menores/fallecidos → `requires_human_contact`; sin grants nuevos a `anon`.

## Seguridad y reversibilidad (restricciones duras)

- **`pg_dump` verificado obligatorio** antes de `--apply` (mismo gate que ADR-0008).
- **DRY-RUN por defecto**, `--apply` explícito escribe (patrón de los scripts de remediación, ADR-0007).
- **Idempotente:** `raw_rows.content_hash` (único) evita re-importar; el `ingest_batch_id` marca lo hecho.
- **Auditado:** cada import/enriquecimiento/enqueue deja rastro en `audit_log`.
- **Reversible por lote:** deshacer = revertir por `ingest_batch_id` (borrar pacientes del lote sin
  admisiones previas, revertir `COALESCE` con el valor anterior guardado en el payload de audit).
- **Menores/fallecidos:** entran con `is_minor` / estado `deceased`; el buscador ya los marca
  `requires_human_contact` (no expone datos).

## Fases (cada una: dry-run → revisar → apply, con dump)

- **F0 — Migración 0020 de procedencia** (aditiva, sin datos).
- **F1 — Importar `ONLY_IN_SOURCE`** (5.333) vía `IngestPatientList`, colapsando `DUP_IN_SOURCE`, tagueado por lote.
- **F2 — Enriquecer** `MATCH_IDENTICAL`/`MATCH_CONFLICT` (fill-only) + `sensitive`.
- **F3 — Enrutar conflictos/alertas** (3.858) a la cola `/admin`; resolución humana con `MergePatients`.

## Consecuencias

- Prod gana la cobertura del consolidado sin perder sus 4.476 registros propios.
- La cola de revisión de `/admin` crece (~3.858 + lo que la re-dedup levante); es el precio de no colapsar personas.
- Se estrena el modelo de procedencia: de acá en más, "de dónde salió" es un `JOIN`, no un match difuso.
- El esquema `reconciliation` puede droppearse tras F3 (el resultado ya vive en prod + audit + procedencia).

## Reversibilidad

Cada fase es un lote (`ingest_batch_id`) reversible; los datos crudos persisten en `reconciliation.raw` y
`raw_rows`. Deshacer una fase no afecta a las otras ni a `ONLY_IN_PRODUCTION`.

## Pendientes antes de "acepto"

- Confirmar el mapeo sensible de `Refugio Oeste` contra la skill `privacy-and-security`.
- ¿Actor del lote? (usuario admin bajo cuyo nombre se atribuyen los imports en `audit_log`).
- ¿F1–F3 en una corrida o gate humano entre cada fase? (propongo **gate entre fases**).
