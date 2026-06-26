# 0010 — Ejecución de la fusión de pacientes

Estado: **en progreso** · Rama: `feat/merge-execution` (desde `develop`).
Continúa `0009` (cola de revisión triage). Capas: domain (regla de campos) · application (use case +
port) · infrastructure (Drizzle transaccional) · presentation (acción Fusionar).
**Privacidad: muta y borra datos de pacientes** → `privacy-and-security.md`.

> Cuando el moderador resuelve un caso como **Fusionar**, se ejecuta de verdad: el **candidato
> pre-existente sobrevive** (target) y el **registro nuevo duplicado** (source) se funde en él y se
> **elimina** (hard delete, decisión de Jorge). El buscador queda limpio sin tocar el RPC.

## 1. Pasos de la fusión (transaccional, todo-o-nada)

En una transacción (`db.transaction`):
1. **Re-apuntar ingresos**: `UPDATE admissions SET patient_id = target WHERE patient_id = source`.
2. **Mover sensibles**: `UPDATE sensitive.contacts SET patient_id = target WHERE patient_id = source`.
   (Las notas clínicas cuelgan del ingreso → ya viajan al re-apuntar.)
3. **Reconciliar campos** del target con la regla pura `mergedFields` (§2).
4. **Eliminar** el source: `DELETE FROM patients WHERE id = source`.
5. **Audit** `patients_merged` (`actorId`, `entityId = target`, `payload: { mergedFrom: source }`).

> Tras borrar el source, su flag `dedup_*` deja de aparecer en la cola (la cola hace `INNER JOIN`
> a `patients`), así que el caso se cierra solo. La traza queda en `raw_rows` (dato crudo) + `audit`.

## 2. Dominio (TDD) — `mergedFields`

`domain/services/patient-merge.ts`:
```ts
export interface MergeSide { documentNormalized: string | null; documentValid: boolean;
  isMinor: boolean; status: PatientStatus; }
export interface MergeChanges { documentNormalized?: string; isMinor?: boolean; status?: PatientStatus; }
export function mergedFields(target: MergeSide, source: MergeSide): MergeChanges;
```
Reglas (no perder dato del target; solo completar/elevar):
- Si el target **no** tiene cédula válida y el source **sí** → copiar `documentNormalized`.
- Si el source es menor y el target no → `isMinor = true`.
- Si el source está fallecido y el target no → `status = "deceased"`.
- Si no hay nada que cambiar → `{}`.

**Criterios:** target con cédula y source con otra → no cambia el documento; target sin cédula y
source con cédula válida → copia; source menor/fallecido eleva; iguales → `{}`.

## 3. Aplicación

`ports/patient-merger.ts`:
```ts
export interface PatientMerger {
  merge(input: { targetId: string; sourceId: string; actorId: string | null }): Promise<void>;
}
```

`use-cases/merge-patients.ts` → `MergePatients.execute(input)`:
- Valida `targetId !== sourceId` (si no, lanza). Delega en `merger.merge`.
- **TDD** con fake: target===source lanza y no llama al merger; distintos → llama una vez.

> La reconciliación de campos (`mergedFields`) la aplica el **adapter** dentro de la transacción
> (carga ambos pacientes y usa la regla pura del dominio). El use case queda como seam de composición.

## 4. Infraestructura

`DrizzlePatientMerger.merge(...)` en `db.transaction(async (tx) => { ... })`:
carga target+source (`document`, `isMinor`, `status`), computa `mergedFields`, re-apunta
`admissions` y `sensitive.contacts`, aplica los cambios al target, borra el source e inserta el
`audit`. Todo con `tx`. Wiring `mergePatientsUseCase` en composition.

## 5. Presentación

`resolveReviewAction` (ya existe): cuando `decision === "merge"`:
- Exige `candidateId` (sin candidato no se puede fusionar → error).
- Ejecuta `MergePatients.execute({ targetId: candidateId, sourceId: patientId, actorId })`.
- Luego registra `review_resolved` (decisión).
Para `keep` / `more_info`: solo registra la decisión (como hoy). Solo **moderador** (re-verificado).

## 6. Verificación

- TDD verde de `mergedFields` y `MergePatients`.
- `pnpm typecheck && pnpm test && pnpm build`.
- **No se ejecuta ninguna fusión real sobre prod sin OK explícito de Jorge.** El disparo real es el
  moderador logueado pulsando **Fusionar** en `/admin/review`.

## 7. Fuera de alcance

Deshacer una fusión (la traza queda en audit + raw_rows, pero no hay UI de undo), fusión de >2
registros en un clic, re-cálculo de dedup tras fusionar.
