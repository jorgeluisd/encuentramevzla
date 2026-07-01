# 0020 — Endurecimiento de identidad, deduplicación y limpieza de prod

Estado: **propuesto** · Rama sugerida: `feat/0020-dedup-hardening` (desde `develop`).
Capas: domain (matching + identidad) · application (ingesta + ports) · infrastructure (Drizzle +
catálogo hospitales) · presentation (`/admin/cargar`, `/admin/review`, dictado).
**Privacidad: toca identidad de pacientes y usa el teléfono como señal** → `privacy-and-security.md`.

> **Nota de numeración:** el número `0019` ya estaba en uso (`0019-ingest-candidate-prefilter.md`),
> por eso este incremento es `0020`.

> Reusa lo ya construido: **0002** (value objects + similitud), **0009** (cola de revisión triage),
> **0010** (ejecución de fusión), **0019** (prefiltro de candidatos). NO reinventa la cola ni el
> merge: extiende el **motor de decisión** y agrega **catálogo de hospitales**, **política de carga
> ajena** y **remediación de prod**.

---

## 0. Datos reales (prod, consulta read-only 2026-06-30)

Consulta por apellido `diaz` (122 pacientes) — duplicados confirmados en tres patrones:

- **Identidad fuerte duplicada (misma cédula):** `diaz sandra` cédula `11638321` ×2 mismo hospital ·
  `diaz soza ana alecia` (uno con `10576803`, otro sin) mismo hospital.
- **Mismo nombre + MISMO hospital sin cédula, duplicado:** `diaz adrian`, `diaz luis`,
  `diaz yanderson`, `diaz yonaiker` con 2 registros c/u en "CAMPO DE GOLF CARIBE". *La lógica actual
  SÍ los fusionaría* → esta data entró **antes del dedup** o por una vía que lo salteó (seed/carga
  temprana). Confirma que hay que **limpiar** lo ya cargado, no solo arreglar el motor.
- **Mismo nombre + DISTINTO hospital sin cédula:** `diaz adrian` en 3 hospitales · `pico diaz jenny`
  (edad 54) en 2 hospitales → mezcla de **homónimos** y **traslados**, indistinguibles solo por
  nombre.

**Columnas del Excel real** (`draft/source/…`, hojas por-hospital): `N°`, `APELLIDOS Y NOMBRES`,
`EDAD`, `CÉDULA / ID`, `TELÉFONO`, `DIRECCIÓN`, `OBSERVACIONES`. **No hay fecha de nacimiento ni
sexo.** Señales de identidad disponibles: **cédula** (fuerte) · **teléfono** (media-fuerte) ·
**dirección** (media) · **edad** (débil).

## 1. Principio rector (política conservadora) — ver ADR-0004

> **El nombre NUNCA decide por sí solo — ni para fusionar, ni para dar por distintas a dos personas.**
> Solo una **señal fuerte** confirma "misma persona": **misma cédula válida** o **mismo teléfono**.
> Sin señal fuerte, ante ambigüedad relevante → **revisión humana**; si no, se mantienen **separados**
> (homónimos). Ante la duda, humano. Jamás colapsar personas automáticamente.

Consecuencia directa sobre los ejemplos:
- **4 "Juan Pérez" mismo hospital sin cédula/teléfono** → 4 registros, marcados `pending_review`
  (hoy: se colapsaban en 1). ✅ resuelto.
- **`diaz camila`** (mismo hospital, misma edad, uno con cédula / otro sin) → **no auto-merge** por
  edad; va a revisión (en Venezuela muchos menores no tienen cédula; la edad no prueba identidad).
- **`diaz adrian`** (mismo nombre, distinto hospital, sin cédula) → **se mantienen separados**
  (homónimos), sin inundar la cola. Solo se fusionan si aparece cédula/teléfono común.

## 2. Motor de matching (dominio, TDD) — `patient-matching.ts`

Extiende `decideMatch`. Señal nueva: **teléfono normalizado** (comparado como igualdad de los
últimos 7–10 dígitos; nunca se expone — ver §8).

### 2.1 Entrada enriquecida

```ts
interface PatientIdentity {
  name: PersonName;
  document: DocumentId | null;
  phone: NormalizedPhone | null;   // NUEVO — value object
  age: number | null;              // NUEVO — solo desempate/prioridad
}
interface MatchCandidate {
  id: string; name: PersonName; document: DocumentId | null;
  phone: NormalizedPhone | null;   // NUEVO
  age: number | null;              // NUEVO
  hospitalIds: Set<string>;
}
```

Nuevo value object `domain/value-objects/normalized-phone.ts`:
- `fromRaw(raw)` → solo dígitos; `isValid` si ≥ 7 dígitos; `equals(other)` compara los últimos 7
  (tolera prefijo país/0 inicial). TDD: `"0414-1234567"` == `"4141234567"` == `"+58 414 1234567"`.

### 2.2 Umbrales (constantes, calibrables por TDD)

```
MERGE_BY_NAME        = 0.92   // (se conserva; ya NO basta solo con esto sin cédula/teléfono)
REVIEW_BY_NAME       = 0.80
SAME_DOCUMENT_NAME   = 0.50
DOC_TYPO_DISTANCE    = 2
PHONE_MERGE_NAME     = 0.85   // NUEVO: teléfono igual + nombre ≥ 0.85 → misma persona
AGE_TOLERANCE        = 2      // NUEVO: |edadA - edadB| > 2 refuerza "personas distintas"
```

### 2.3 Árbol de decisión (de → a)

| # | Caso | Hoy | **0020** |
|---|---|---|---|
| 1 | Misma cédula válida, nombre ≥ 0.50 | merge | merge *(igual)* |
| 2 | Misma cédula válida, nombre < 0.50 | conflict | conflict *(igual)* |
| 3 | Cédulas válidas distintas, nombre ≥ 0.92, Levenshtein ≤ 2 | review | review *(igual)* |
| 4 | Cédulas válidas distintas, nombre ≥ 0.92, Levenshtein > 2 | new | new *(igual)* |
| 5 | **Teléfono igual + nombre ≥ 0.85** (sin cédula concluyente) | *(no existía)* | **merge** ✅ |
| 6 | Nombre ≥ 0.92, **mismo** hospital, sin cédula/teléfono | **merge** | **review** ✅ (cambio) |
| 7 | Nombre ≥ 0.92, **distinto** hospital, sin cédula/teléfono | new | new *(se mantienen separados)* |
| 8 | 0.80 ≤ nombre < 0.92 | review | review *(igual)* |
| 9 | Nombre < 0.80 | new | new *(igual)* |

- **Edad** (nueva, débil): si ambas edades presentes y `|Δ| > AGE_TOLERANCE`, **nunca** promueve a
  merge; en el caso 6 puede degradar `review → keep-separate` (probablemente homónimos), y en la cola
  ordena prioridad. **La edad no fusiona jamás.**
- El cambio nuclear es el **caso 6**: mismo nombre + mismo hospital sin señal fuerte ya **no**
  auto-fusiona (resuelve los "4 Juan Pérez"). El caso 5 (teléfono) es el que evita duplicar a la
  misma persona **entre** hospitales cuando hay evidencia real.

### 2.4 Criterios TDD (dominio puro)

- `NormalizedPhone.equals` tolera prefijos; inválido (<7 dígitos) nunca hace match.
- Caso 5: dos registros sin cédula, teléfono igual, nombre 0.9 → `merge`.
- Caso 6: dos "juan perez" mismo hospital, sin cédula/teléfono → `review` (no `merge`).
- Caso 6 con edades 8 y 40 → `new`/keep-separate (edad separa), no `review`.
- Caso 7: "juan perez" en H1 y H2, sin señal → `new` ×2 (no se tocan).
- Regla dura: ningún test debe producir `merge` con **solo** nombre igual.

## 3. Reuso de la cola (0009) y la fusión (0010)

El motor no crea infraestructura nueva de revisión: **mapea a las acciones de audit existentes**.

| Decisión del motor | Acción audit (append-only) | Aparece en `/admin/review` |
|---|---|---|
| `conflict` (caso 2) | `dedup_document_conflict` | sí *(ya)* |
| `review` (casos 3, 6, 8) | `dedup_pending_review` | sí *(ya)* |
| `merge` (casos 1, 5) | merge en ingesta *(no crea flag)* | no |
| `new` (casos 4, 7, 9) | inserción normal | no |

- La cola (0009) y la resolución **Fusionar/Mantener separados/Más info** + la ejecución real (0010,
  `MergePatients` + `mergedFields`) **se reusan tal cual**. El único cambio: el caso 6 ahora **puebla**
  la cola en vez de fusionar en silencio.
- **Homónimos cross-hospital (caso 7) NO se marcan** — se mantienen separados sin flag, para no
  inundar la cola con lo que casi siempre son personas distintas.
- `mergedFields` se **extiende** para completar teléfono/dirección faltantes en el target (sin perder
  dato), coherente con la regla "solo completar/elevar".

## 4. Catálogo canónico de hospitales + alias — ver ADR-0005

Hoy `HospitalRepository.resolveByName` crea un hospital por cada variante de texto (case-insensitive
pero sin alias ni fuzzy) → "CAMPO DE GOLF CARIBE" vs "Campo de Golf" vs "H. Vargas" quedan separados.

- **Tabla nueva** `public.hospital_aliases (alias_normalized text unique, hospital_id uuid)`.
- **Normalización fuerte** (dominio puro, TDD) `normalizeHospitalName`: NFD, sin acentos, minúsculas,
  quita prefijos `hospital|hosp\.?|h\.?|clinica|centro|ambulatorio|cdi`, colapsa espacios.
- `resolveByName` nuevo orden: **exacto** (normalizado) → **alias** → **fuzzy** (`trigramSimilarity`
  contra el catálogo, umbral `HOSPITAL_MATCH = 0.6`). Si match alto → canónico. Si dudoso → crea
  **hospital provisional** marcado para revisión del moderador; **no** genera variantes en silencio.
- **Seed** inicial del catálogo con la lista oficial (las hojas del Excel dan el punto de partida:
  Domingo Luciani, Universitario de Caracas, Pérez Carreño, Cruz Roja, Periférico de Catia, Vargas,
  Militar Dr. Carlos Arvelo, Ricardo Baquero González, Domingo Luciani, refugios/centros de acopio…).

## 5. Carga "scoped": filas de otro hospital — ver ADR-0006

Hoy, con `forcedHospitalId`, **se ignora la columna** y toda fila se atribuye al hospital del miembro
(solo se cuenta `otherHospitalsMentioned`). Riesgo: cargar data ajena como propia.

- Si una fila trae `hospitalName` que, tras `normalizeHospitalName`+alias, **no** resuelve al hospital
  forzado → **no se ingesta como propia**. Se **segrega** a una bandeja "filas de otro hospital".
- **Auditoría por fila** (no solo conteo): `ingest_foreign_hospital_row` con el nombre ajeno y el
  fingerprint. Notificación al uploader y al moderador.
- Un **moderador** puede **reasignar** esas filas al hospital correcto (o descartarlas). Nunca se
  atribuyen en silencio.

## 6. Remediación de la data existente en prod — ver ADR-0007

Arregla lo ya sucio. **Todo ensayado en local/staging con dump de prod. Reversible y auditado.
Nada destructivo sin respaldo.**

1. **Fase 0 — auditoría read-only:** script que clasifica duplicados (extiende el probe ya usado):
   *fuertes* (misma cédula) · *mismo hospital + mismo teléfono* · *mismo hospital solo nombre* ·
   *cross-hospital solo nombre* · *variantes de hospital*.
2. **Unificar hospitales primero** (catálogo/alias de §4): reasignar `admissions`, limpiar huérfanos.
3. **Merge escalonado por confianza** (reusa `MergePatients` de 0010):
   - **Auto (seguro):** SOLO misma cédula válida (ej. `diaz sandra`).
   - **Auto (medio, opcional, auditado):** mismo hospital **+ mismo teléfono** + nombre alto. **No por
     edad** (respeta `diaz camila`).
   - **A la cola (humano):** mismo nombre + mismo hospital sin señal fuerte (pares en "CAMPO DE GOLF
     CARIBE", `diaz camila`).
   - **Se mantienen separados:** mismo nombre, **distinto** hospital, sin cédula/teléfono (`diaz
     adrian`…). Marca opcional de baja prioridad.
4. **Reversibilidad:** cada merge guarda `old_id → surviving_id` en `audit_log` (`patients_merged`);
   deshacible manualmente. La traza cruda queda en `raw_rows`.

## 7. UX complementaria

Dos pedidos que viajan con este incremento (presentación, sin tocar dominio):

- **Skeleton al cambiar de hospital en `/admin/cargar`:** al cambiar el hospital seleccionado la
  consulta tarda y no hay feedback. Mostrar el `ListaSkeleton` (ya existente, commit `b8ffb7e`)
  **también** en la transición de cambio de hospital (envolver el cambio en `useTransition`/estado de
  carga). Criterio: al cambiar de hospital se ve el skeleton hasta que llega la nueva lista.
- **El botón de dictado despliega el formulario:** al pulsar "dictar", **abrir/expandir** el
  formulario de alta para que la persona **vea los campos mientras habla** y sepa qué debe decir.
  Criterio: pulsar dictado revela el formulario y arranca la captura simultáneamente.

> Si se prefiere, estos dos puntos pueden extraerse a un spec `0021-ux-cargar` menor; se dejan aquí
> por haberse pedido en el mismo lote.

## 8. Privacidad (innegociable)

- **Teléfono como señal, sin romper `public`/`sensitive`:** el teléfono vive en `sensitive`. El match
  por teléfono se hace **server-side dentro de la ingesta**, cargando el teléfono de los candidatos
  desde `sensitive` en el camino de confianza y comparando **en memoria**. **No** se agrega teléfono
  ni `phone_hash` al schema `public` (evita enumeración). Revisar `privacy-and-security.md` antes de
  implementar el prefiltro por teléfono.
- No se loguea el teléfono en claro en ningún audit; los payloads de dedup siguen sin datos sensibles.
- La política conservadora **reduce** el riesgo de exponer a la persona equivocada al no colapsar
  homónimos.

## 9. Verificación

- TDD verde: `NormalizedPhone`, `normalizeHospitalName`, `decideMatch` (casos 1–9 de §2.3),
  `mergedFields` extendido.
- `pnpm typecheck && pnpm test && pnpm build` (objetivo 4/4).
- Consulta read-only contra prod que reproduzca la clasificación de §6 Fase 0.
- **Ninguna fusión/backfill real sobre prod sin OK explícito de Jorge**, y solo tras ensayo en dump.

## 10. Fuera de alcance

- Agregar fecha de nacimiento/sexo al template del Excel (requiere coordinar con hospitales) → se
  deja como recomendación, no bloquea.
- Deshacer fusión con UI (undo). Fusión de >2 registros en un clic.
- Aprendizaje/ML de matching. Blocking distribuido a gran escala.

## Referencias

- ADR-0004 (matching conservador sin cédula) · ADR-0005 (catálogo de hospitales) ·
  ADR-0006 (carga scoped, filas ajenas) · ADR-0007 (remediación dedup prod).
- Specs: 0002, 0005, 0009, 0010, 0017, 0018 (voz), 0019.
