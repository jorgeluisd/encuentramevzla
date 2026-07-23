# ADR-0008 — Reconciliación de la fuente consolidada (diagnóstico, no ejecución)

Fecha: 2026-07-23 · Estado: **aceptado** · Extiende: [[ADR-0004]] (matching conservador), [[ADR-0005]] (catálogo de hospitales), [[ADR-0007]] (remediación prod) · Reusa: `packages/core/.../patient-registry/domain`.

> Este ADR decide **cómo diagnosticar** si conviene reconciliar o reemplazar el contenido actual con un
> `.xlsx` consolidado. **No ejecuta** ninguna de las dos: produce el reporte cuantificado que soporta esa
> decisión. Toda operación es **solo lectura sobre producción**; el staging vive en un esquema aislado y
> **droppable** (`reconciliation`).

---

## Contexto

Prod contiene registros cargados por varios miembros del equipo desde transcripciones manuales (fotos de
listados en papel, capturas de WhatsApp), sin certeza de procedencia ni calidad por registro. Recibimos un
`.xlsx` consolidado —mejor higiene de formato y más cobertura, pero **también** transcrito a mano, así que
**no es verdad absoluta**.

**Hechos medidos** (inventario 2026-07-23):

| | Producción (read-only) | Excel consolidado |
|---|---|---|
| Registros | **6.529** pacientes / 7.576 admisiones | **~9.194** filas (21 pestañas) |
| Sin cédula (< 6 dígitos) | 4.522 (**69%**) | 5.071 (**55%**) |
| Centros | 26 hospitales | 21 pestañas |
| PII ligada | 4.541 `sensitive.contacts` | inline (`Refugio Oeste` +14 columnas) |

**Asimetrías que mandan la decisión:**

1. **El Excel es más grande por centro** (Pérez Carreño 2.848 vs 1.492; Domingo Luciani 1.804 vs 717) →
   habrá mucho `ONLY_IN_SOURCE`. Es la cobertura nueva que aporta el consolidado.
2. **Prod tiene centros que el Excel NO cubre**, con volumen real: **Polideportivo La Guaira (597),
   Ricardo Baquero González (412), Centro de Acopio Caraballeda (246)** — sin pestaña equivalente. Un
   reemplazo ciego **borraría ~1.255 pacientes reales**. Es la sección crítica `ONLY_IN_PRODUCTION`.
3. Prod ya pasó por dedup/merge ([[ADR-0007]]) y tiene `sensitive.contacts` ligados por FK; reemplazar
   descarta ese trabajo y esos vínculos.

**Estado del esquema** (relevante para el diseño):

- **No existe modelo de procedencia** en `patients`/`admissions` (columnas: solo `created_at` como pista
  temporal). La única procedencia del sistema vive en `raw_rows` (`file_id, uploaded_by, content_hash`),
  pero **ningún FK liga un `patient` a su `raw_row` ni a un lote**. Por eso hoy no podemos responder "¿de
  dónde salió este registro?" — el hueco que motiva parte de este ADR.
- Extensiones `pg_trgm`, `fuzzystrmatch`, `unaccent` **ya habilitadas** (migración 0001). No falta ninguna.
- `sensitive.contacts/clinical_notes` guardan PII en **texto plano**; protección = aislamiento de esquema +
  RLS FORCE + REVOKE total a anon (nunca por PostgREST). No hay cifrado a nivel de columna en prod hoy.
- Catálogo `hospitals` + `hospital_aliases` ([[ADR-0005]]) para canonicalizar nombres de centro.

**Peligros de datos ya detectados en el Excel** (se manejan explícitamente, ver §Decisión):
cédula vacía 55% · centinelas en `CÉDULA` (`-`×172, `INFANTE`×43, `SIN CI`×32, `[Menor]`×28, `NPD`,
`NO POSEE`, `S/D`…) · `FECHA REG.` heterogénea (datetime / texto / rangos `25/06-26/06` / basura de
encabezado `Fecha Actualización`) · marcadores `[?]` (≥255 filas) y `[ILEGIBLE]` (8) · `CENTRO ACTUAL`
vacío en algunas filas (la **pestaña** es la fuente autoritativa del centro) · artefacto `12/30/1899` en
`HORA REG.` (se ignora).

---

## Opciones

### Opción A — Reemplazar (truncate + recarga desde el Excel)
Vaciar prod y recargar desde el consolidado.
- ➕ Simple; un solo origen "limpio".
- ➖ **Borra ~1.255 pacientes de centros que el Excel no cubre.** ➖ Descarta dedup/merge previo y los
  vínculos `sensitive.contacts`. ➖ El Excel también es transcripción manual: cambia un ruido por otro.
  ➖ **Viola la restricción dura de cero-mutación.** → Descartada de entrada como acción de este trabajo.

### Opción B — Reconciliar: diagnóstico cuantificado primero, merge selectivo después (**recomendada**)
Ingerir el Excel a un staging aislado, cruzar contra prod con matching difuso, clasificar en 4 categorías +
duplicados intra-staging + alertas de cédula, y **reportar**. La decisión de qué fusionar/importar se toma
después, con datos, y reusaría la maquinaria conservadora ya existente ([[ADR-0004]], [[ADR-0007]]).
- ➕ Cero pérdida; ➕ respeta cero-mutación; ➕ reversible por `DROP SCHEMA`; ➕ produce la evidencia para
  decidir bien. ➖ Más trabajo; el reporte requiere lectura humana antes de actuar.

### Opción C — No hacer nada
- ➖ Perdemos la cobertura extra del consolidado y seguimos sin saber la calidad relativa. Descartada.

**Recomendación: Opción B.** El costo de un reemplazo mal informado (borrar centros solo-prod, romper
vínculos sensibles) es irreversible y toca vidas; el costo de reconciliar es tiempo de cómputo y revisión.

---

## Decisión

### 1. Estrategia de matching y umbrales
Reusar el dominio existente (`patient-matching.ts`, [[ADR-0004]]) — **el nombre nunca decide solo**:

- **Normalización determinista y testeable en el dominio** (no en SQL): nombres vía `PersonName.fromRaw`
  (`unaccent` → `upper` → colapso de espacios, orden `APELLIDO NOMBRE` para espejar `normalized_name` de
  prod); cédula vía `DocumentId.fromRaw` (solo dígitos, strip de ceros a la izquierda, válida ≥ 6 dígitos).
- **Bloqueo** para acotar el producto cartesiano: por **centro canónico** (`normalizeHospitalName` +
  `hospital_aliases`) y por **primer carácter del apellido** normalizado.
- **Similitud** con `pg_trgm` (`word_similarity`) sobre `apellido || ' ' || nombre`, con `levenshtein`
  como desempate. Espejo del dominio (`0.5·trigram + 0.5·tokenSet`).
- **Umbrales por defecto** (configurables por corrida, justificados aquí):

  | Umbral | Valor | Origen / porqué |
  |---|---|---|
  | `MATCH_IDENTICAL` (sin conflicto) | **≥ 0.92** | `MERGE_BY_NAME` del dominio |
  | Banda de conflicto/revisión | **0.80 – 0.92** | `REVIEW_BY_NAME`; nombre alto sin certeza |
  | Piso de candidato | **≥ 0.72** | por debajo ⇒ `ONLY_IN_SOURCE` (no es la misma persona) |
  | Refuerzo por cédula | cédula válida **igual** en ambos lados | sube confianza; no auto-fusiona |
  | Tolerancia de edad | **± 2** | `AGE_TOLERANCE`; fuera de rango ⇒ conflicto |
  | Typo de cédula (Levenshtein) | **≤ 2** | `DOC_TYPO_DISTANCE` |

- **Señal de alerta (no match automático):** cédula normalizada **igual** con **nombres divergentes**
  (< 0.80) ⇒ **revisión humana** (`resolution_status = needs_review`), nunca match silencioso.
- **Duplicados intra-staging:** el propio consolidado los trae; se detectan con el mismo criterio dentro de
  `staging_patient_record` y se reportan aparte.

### 2. Categorías de salida

| Categoría | Definición operativa |
|---|---|
| `ONLY_IN_SOURCE` | En el Excel, sin candidato en prod ≥ 0.72 |
| `MATCH_IDENTICAL` | En ambos, score ≥ 0.92 y sin conflicto en campos comparables |
| `MATCH_CONFLICT` | En ambos (≥ 0.80), con discrepancia en **cédula, edad (±2), sexo o centro** |
| `ONLY_IN_PRODUCTION` | En prod, sin contraparte en el Excel — **sección crítica** |

### 3. Modelo de procedencia (recomendación; **no se aplica** en este trabajo)
El hueco de fondo: los `patients` no saben de dónde vienen. Para que esta decisión **no se repita**, se
recomienda (migración futura, additive e idempotente, **fuera de este pipeline**):

- Tabla `patient_provenance(patient_id FK, source_kind, source_ref, ingest_batch_id, ingested_by,
  created_at)`, o si se prefiere plano: `patients.source_ref`, `patients.ingest_batch_id`,
  `patients.ingested_by`. Poblada a partir de `raw_rows` en cada ingesta.
- Un `ingest_batch(id, source_file_name, source_file_hash, started_at, actor)` como ancla de lote.

Esto convierte futuras reconciliaciones en un `JOIN`, no en un match difuso. **Se documenta aquí; aplicarlo
es decisión posterior tuya** (respeta cero-mutación de prod ahora).

### 4. Las 14 columnas sensibles de `Refugio Oeste`
Bajo el modelo de búsqueda mediada, la superficie pública jamás ve PII. Para el staging:

- **Se ingieren crudas como `TEXT`** dentro de `reconciliation` (esquema aislado y **efímero**: se destruye
  con `DROP SCHEMA reconciliation CASCADE`). El crudo nunca se pierde durante la corrida.
- **No se indexan** ni entran al matching. El cruce de `Refugio Oeste` usa **solo** las columnas comunes
  (`APELLIDO`, `NOMBRE`, `CÉDULA`, `EDAD`, `SEXO`, centro=pestaña).
- **Nunca salen en el reporte** (que se versiona en `docs/reports/`).
- **Sin cifrado**: el esquema se destruye al terminar; cifrar datos que igual se borran añade complejidad
  sin reducir la superficie real. Si estas 14 columnas **se importaran** a prod en el futuro, eso es una
  decisión aparte que debe pasar por la skill `privacy-and-security.md` y por el modelo de `sensitive`
  (teléfono → `sensitive.contacts`; patologías/dirección → `sensitive.*`; nada al esquema `public`).

### 5. Cuándo el reemplazo pasaría a ser defendible (condiciones **medibles**)
Reconciliar hoy; reemplazar solo si una corrida futura demuestra **todas**:

1. `ONLY_IN_PRODUCTION` ≈ 0 salvo centros que **sí** mapean a alguna pestaña (0 pacientes reales huérfanos).
2. El Excel cubre **todos** los centros activos de prod (hoy faltan ≥ 3 con ~1.255 pacientes).
3. `MATCH_IDENTICAL / (IDENTICAL + CONFLICT)` ≥ 0.9 (el consolidado concuerda con prod donde se solapan).
4. El Excel **no degrada** el llenado de cédula ni pierde los vínculos `sensitive.contacts` existentes.

Mientras (2) no se cumpla, **reemplazar es indefendible**.

### 6. Infraestructura del pipeline (restricciones duras)
- Esquema **nuevo y aislado** `reconciliation` **dentro de la BD de prod** (no hay ambiente separado).
  Cero tablas sueltas en `public`.
- **Cero mutación** de tablas preexistentes: nada de `DELETE/TRUNCATE/UPDATE/DROP` sobre `public`/
  `sensitive`. Read-only estricto (verificado por test de integración).
- **Idempotente y re-ejecutable**: cada corrida es un `run_id` (UUID); repetir no ensucia corridas previas.
  Re-ingerir el mismo `source_file_hash` (SHA-256) **aborta** salvo `--force`.
- **Reversible por completo** con `DROP SCHEMA reconciliation CASCADE`, sin efecto sobre prod.
- **`pg_dump` verificado obligatorio** antes de cualquier escritura (runbook, ver §Reversibilidad).

### 7. Arquitectura (hexagonal, reusa dominio)
- Parser `.xlsx` = **adaptador de entrada** tras un puerto (`ConsolidatedSourceReader`); el dominio no
  conoce `xlsx`. Falla ruidoso si una pestaña no expone las columnas esperadas (nada de degradar en
  silencio).
- Normalización = value objects puros del dominio (`PersonName`, `DocumentId`), **testeables** y
  compartidos con el resto del registro.
- Motor de categorización = servicio de aplicación puro sobre puertos (`StagingRepository`,
  `ProductionReadModel`); la similitud SQL vive tras un puerto de infraestructura.

---

## Consecuencias

- Se añade el esquema `reconciliation` con `reconciliation_run`, `staging_patient_record`,
  `reconciliation_match`; el crudo del Excel se preserva íntegro en staging.
- El reporte (`docs/reports/`) cuantifica las 4 categorías (global + por centro), lista **completo**
  `ONLY_IN_PRODUCTION` con procedencia disponible / fecha / centro (marcando centros sin pestaña),
  muestra 20 `MATCH_CONFLICT` lado a lado, los duplicados intra-staging y la **distribución de
  `similarity_score`** para calibrar umbrales.
- Persiste el hueco de procedencia en prod hasta que se aplique (opcionalmente) la migración recomendada.
- El equipo obtiene evidencia para decidir reconciliar vs reemplazar **sin** haber tocado un solo registro.

## Reversibilidad

- **Runbook de corrida:** (1) `pg_dump` de prod **verificado** (restauración de prueba en local); (2)
  `CREATE SCHEMA reconciliation`; (3) ingesta + match bajo un `run_id`; (4) reporte. Deshacer todo =
  `DROP SCHEMA reconciliation CASCADE`.
- Nada de este pipeline muta `public`/`sensitive`; el peor caso (esquema a medio poblar) se limpia con el
  `DROP SCHEMA`. La decisión de actuar sobre el diagnóstico es un paso **separado** y aún no autorizado.

---

## Resultado del diagnóstico y decisión (2026-07-23)

Corrida oficial contra prod (`run_id dedc32e8…`, esquema `reconciliation`, prod verificada
intacta): de 6.529 pacientes en producción, **4.476 (69%) NO tienen contraparte en el Excel**
(`ONLY_IN_PRODUCTION`) — incluidos centros enteros que el consolidado no cubre (Ricardo Baquero
González, Polideportivo La Guaira, Centro de Acopio Caraballeda, entre otros). Categorías:
`MATCH_IDENTICAL` 2.703 · `MATCH_CONFLICT` 1.187 · `ONLY_IN_SOURCE` 5.333 · `ONLY_IN_PRODUCTION`
4.476 · `DUP_IN_SOURCE` 2.671.

**Decisión: RECONCILIAR, no reemplazar.** Un reemplazo perdería ~4.476 pacientes reales, lo que
viola el propósito humanitario del registro. La condición medible para que el reemplazo fuese
defendible (cobertura total de los centros de prod por el Excel) **no se cumple**.

La **ejecución** de la reconciliación (importar los `ONLY_IN_SOURCE`, resolver los casos a revisión,
fusionar) es un trabajo posterior con su propio diseño; este ADR cierra solo el **diagnóstico**.

### Nota de convención
El prompt pedía la ruta `docs/adr/ADR-XXXX-…`; el repo ya usa `adr/NNNN-slug.md`. Se sigue la convención
del repo (`adr/0008-reconciliacion-fuente-consolidada.md`). Dime si prefieres la otra ruta.
