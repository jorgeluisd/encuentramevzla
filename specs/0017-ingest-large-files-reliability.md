# Spec 0017 — Ingesta robusta para archivos grandes (capacidad + feedback)

Estado: **implementado** (Gate 1 aprobado 2026-06-27, plan **Vercel Hobby**) · Capacidad: `patient-registry`
Relacionado: spec 0008 (ingesta + dedup), spec 0013 (sello "última actualización").
Origen: bug en producción (2026-06-26) — un Excel de 2.760 filas dejó la UI en "Procesando…"
indefinidamente; las `raw_rows` entraron pero el pipeline de dedup se cortó por **timeout de la
función serverless** antes de crear pacientes/admisiones y antes de `revalidatePath("/")`. Se completó
a mano con un script one-off; este spec evita que vuelva a pasar.

## 1. Motivación

`subirExcelAction` procesa el archivo **entero y sincrónico** dentro de una Server Action:
`parse → persistNew → loadAll → loop fila-a-fila → revalidate`. Dos cuellos:

1. **N+1 de escritura.** El `decideMatch` es en memoria (barato), pero por **cada fila** se hace
   `patients.create` + `admissions.findId` + `admissions.create` + `sensitive.save*` — miles de
   round-trips secuenciales a Supabase. 2.760 filas ≈ 13 min. En Vercel la función se corta mucho antes.
2. **Sin feedback.** El botón queda en "Procesando…" para siempre; no se distingue éxito, error ni timeout.

Consecuencia adicional: como el timeout corta **antes** del `revalidatePath("/")`, el sello "Actualizado"
del home (estático) **no se regenera** y queda desfasado aunque la data haya entrado.

## 2. Alcance

- **A — Capacidad:** que la ingesta de archivos grandes (varios miles de filas) **termine sin timeout**.
- **B — Feedback:** que la UI **siempre** muestre un estado real (procesando / éxito con resumen / error)
  y nunca un spinner infinito; y que el sello "Actualizado" se regenere al completar.

Fuera de alcance (ver §7): job asíncrono/cola para archivos *gigantes*, dashboard de métricas, fix de
zona horaria del audit log (se trata aparte).

## 3. Decisiones (Gate 1 — pendientes de aprobación del dueño)

- **A1 (la clave): eliminar el N+1 con bulk insert.** Refactor del caso de uso `IngestPatientList`:
  hacer todo el dedup **en memoria** (ya lo es) generando los IDs con `newId()` (UUID en cliente) para
  armar el grafo completo (patients, admissions, contacts, clinical_notes) **antes** de tocar la DB, y
  persistir con **un INSERT por lote** por tabla (multi-row), en una transacción. Baja de ~13 min a segundos.
- **A2: subir el techo de tiempo.** **Plan confirmado en Gate 1: Vercel Hobby** (tope **60s**). Por tanto
  `export const maxDuration = 60` + `export const runtime = "nodejs"` en el segmento de la ingesta, como
  **red de seguridad** (no como solución). El peso real recae en **A1**: con bulk insert, 2.760 filas
  bajan de ~13 min a **segundos**, muy por debajo de 60s. (Si en el futuro se pasa a Pro, subir a 300.)
- **A3: subir el límite de payload.** `serverActions.bodySizeLimit` (default **1 MB**) a un valor acorde
  al `.xlsx` más grande esperado (p. ej. **8 MB**) en `next.config.ts`. Sin esto, un Excel grande es
  rechazado antes de procesarse.
- **A4: lotes con commit incremental** — **fuera de alcance en este ciclo.** Con A1 (bulk insert) el peor
  caso real entra holgado en 60s, así que no se necesita trocear. Queda documentado como evolución futura
  (es seguro por la **idempotencia ya existente**: `content_hash` en `raw_rows` + el `decideMatch`
  auto-merge verificado en el incidente; reanudable) si algún archivo gigante volviera a acercarse al tope.
- **B1: estados reales en la UI.** Reemplazar el `pending` booleano por estados explícitos
  (`idle | processing | done | error`) con **timeout defensivo en el cliente**; al exceder, mensaje
  claro ("sigue procesando en el servidor; revisa el audit log") en vez de spinner perpetuo.
- **B2: revalidación garantizada.** Asegurar `revalidatePath("/")` en el camino de éxito (incluido el
  de lotes) y añadir un **endpoint de revalidación on-demand** (`app/api/revalidate/route.ts`, protegido)
  para regenerar el home tras completados fuera de la app (como el de hoy).

## 4. Diseño por capas (Onion)

### 4.1 Aplicación / Dominio (`@evzla/core`, puro)

- `IngestPatientList.execute` se reescribe a **dos fases**:
  1. **Fase en memoria** (sin I/O salvo `loadAll` y `rawRows.persistNew` una vez): recorre filas,
     resuelve hospitales contra un mapa, corre `decideMatch`, y **acumula** mutaciones en estructuras
     (`patientsToInsert[]`, `patientsToUpdate[]`, `admissionsToInsert[]`, `contactsToInsert[]`,
     `notesToInsert[]`) usando `newId()` para los IDs.
  2. **Fase de persistencia**: ports nuevos de escritura en lote.
- **Ports nuevos** (interfaces, testeables con fakes):
  `PatientRepository.createMany(rows)`, `AdmissionRepository.createMany(rows)`,
  `SensitiveDataStore.saveContacts(rows)` / `saveClinicalNotes(rows)`. Se conservan los unitarios para
  compat de tests, o se migran. La `IngestionSummary` no cambia de forma (mismos contadores).
- El dedup intra-archivo y `decideMatch` **no cambian de lógica** (no romper lo verde).

### 4.2 Infraestructura (`apps/web`, adapters Drizzle)

- Implementar los `*Many` con Drizzle `insert().values([...])` (multi-row), troceando a un tamaño de
  lote seguro (p. ej. 500 filas/INSERT por límites de parámetros del driver).
- Envolver la persistencia en `db.transaction(...)` para atomicidad por archivo (o por chunk en A4).

### 4.3 Presentación (`apps/web`)

- `app/admin/(protected)/ingesta/page.tsx`: estados explícitos + timeout de cliente (B1). Mantener la
  tabla "Cargas recientes" y el resumen.
- `maxDuration`/`runtime` (A2) en el segmento que ejecuta la action; `bodySizeLimit` (A3) en `next.config`.
- `app/api/revalidate/route.ts` (B2): POST protegido (token/secreto en env) que llama `revalidatePath("/")`.

## 5. Privacidad (qué se mantiene)

- Sin cambios de superficie: los datos sensibles siguen yendo al schema `sensitive` por conexión directa;
  el público sigue accediendo solo vía `search_patient`. El bulk insert respeta la misma separación.
- El endpoint de revalidación **no expone datos** (solo dispara regeneración); va protegido por secreto.

## 6. Plan TDD / verificación

- **Core (Vitest, test primero):** `IngestPatientList` con fakes que **cuentan llamadas** → afirmar que
  con N filas se hace **1 (o ⌈N/lote⌉) llamada** a `createMany`, no N llamadas unitarias; y que la
  `IngestionSummary` sigue dando los mismos contadores que el diseño actual (paridad de comportamiento).
- **Idempotencia:** reprocesar el mismo set no duplica (mismo invariante usado en el fix manual).
- **Infra:** test de los adapters `*Many` (mapeo correcto, troceado por lote).
- **UI:** estados procesando/done/error/timeout.
- `pnpm typecheck` 4/4 · `pnpm test` verde · `pnpm build` OK · prueba manual con el archivo grande real.

## 7. Fuera de alcance

- **Job asíncrono / cola** (Edge Function o worker disparado tras subir) para archivos *gigantes* que
  excedan incluso el tope serverless (60s en Hobby) — es la solución "definitiva" (opción D); este spec
  la habilita pero no la implementa. **A4** (chunks con commit incremental) es el paso intermedio previo.
- **Dashboard de métricas** de ingesta (vive con el pendiente de analítica).
- **Zona horaria** del audit log (`/admin/audit` muestra UTC) y revalidación del sello tras el completado
  de hoy — fix pequeño e independiente, fuera de este spec.

## 8. Notas de implementación (Gate 1 → implementado, 2026-06-27)

Desviaciones respecto al borrador de §4, todas para reforzar la atomicidad sin perder el anti-N+1:

- **Atomicidad total vía `IngestionUnitOfWork` (port nuevo).** En lugar de inyectar repos sueltos, el
  caso de uso recibe `uow.runAtomic(work)` y **toda** la persistencia (raw_rows + pacientes + admisiones +
  contactos + notas + audit) corre en **una sola transacción**. Cierra el hueco del incidente: si algo
  falla a mitad, rollback completo (incluido `raw_rows`) → el archivo queda **reprocesable** sin el script
  manual. La composición (`DrizzleIngestionUnitOfWork`) abre `db.transaction` y crea repos atados al `tx`.
- **Ports bulk reales:** `PatientRepository.createMany/updateMany`, `AdmissionRepository.createMany`,
  `SensitiveDataStore.saveContacts/saveClinicalNotes`, `AuditLog.recordMany`. Adapters Drizzle con INSERT
  multi-fila troceado a `BATCH = 500`.
- **Admisiones existentes por mapa:** se reemplazó el `findId` fila-a-fila por
  `AdmissionRepository.loadExistingIds(): Map<"patientId|hospitalId", admissionId>` (una lectura). Permite
  reusar una admisión ya en DB (mismo paciente↔hospital de otra carga) en vez de duplicarla, y anclar la
  nota clínica a la admisión correcta.
- **A2 (Hobby):** `maxDuration = 60` + `runtime = "nodejs"` exportados desde el **segmento server** de
  `ingesta/page.tsx` (la UI se movió a `ingesta-client.tsx`, "use client", porque un client component no
  puede exportar config de segmento).
- **A3:** `experimental.serverActions.bodySizeLimit = "8mb"` en `next.config.ts`.
- **B1:** `ingesta-client.tsx` con estados `idle/processing/done/error`, aviso "tarda más de lo normal" a
  los 45s (no cancela la action; evita el spinner perpetuo) y `try/catch/finally`.
- **B2:** `POST /api/revalidate` protegido por `REVALIDATE_TOKEN` (**nueva env var en Vercel**); dispara
  `revalidatePath("/")` sin exponer datos. El camino de éxito de la action ya revalidaba.

**Verificación:** `pnpm typecheck` 4/4 · `pnpm test` verde (core 22 archivos + web 3) · `pnpm build` OK.
Tests core test-primero (RED→GREEN) con asserts de **1 transacción** y **1 llamada bulk por tabla** (no N),
paridad de `IngestionSummary`, y reuso de admisión cross-file. **Pendiente:** prueba manual con el `.xlsx`
real grande en prod + dar de alta `REVALIDATE_TOKEN` en Vercel.
