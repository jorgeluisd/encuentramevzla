# 0009 — Cola de revisión humana (triage)

Estado: **en progreso** · Rama: `feat/review-queue` (desde `develop`).
Capas: domain (matching + decisión) · application (port + use cases) · infrastructure (Drizzle) ·
presentation (`/admin/review`, solo moderador). Privacidad: `privacy-and-security.md`.

> Resuelve los **7 casos dudosos** de la dedup (3 conflictos de cédula + 4 zona gris). **Alcance
> elegido: TRIAGE** — el moderador **registra una decisión** (Fusionar / Mantener separados / Más
> info) y el caso sale de la cola. La **ejecución** real de la fusión (combinar registros) NO va en
> esta entrega: queda para una PR siguiente, bien testeada.

## 0. Datos reales (prod, 2026-06-26)

- **Conflictos de cédula (3):** misma cédula válida, nombres distintos (typos del mismo apellido):
  `29900166` gosling raymond/hairmon · `5199652` ortuno yoni/yenny · `6405488` paredes
  cruzendida/ceneida. El "otro" registro se halla **por la cédula**.
- **Zona gris (4):** valeria contreras · fermine espinosa · harold capella · yaleisy haddan. El
  candidato parecido **no se guardó** → se **recalcula** con `nameSimilarity`.

## 1. Modelo (sin tabla nueva)

- **Cola abierta** = pacientes con un audit `dedup_document_conflict` / `dedup_pending_review`
  que **no** tienen aún un audit `review_resolved` (append-only). Resolver = insertar
  `review_resolved` (`entity: patient`, `entityId: patientId`, `payload: { decision, candidateId? }`).
- Ventaja: cubre los 7 casos existentes sin re-ingestar; consistente con el diseño append-only.

## 2. Dominio (TDD)

- `domain/services/patient-matching.ts` → **`mostSimilarByName(name, candidates)`**:
  devuelve `{ candidate, score }` del más parecido (excluye empate vacío → `null`). Reusa
  `nameSimilarity`. TDD: elige el de mayor score; `null` si no hay candidatos.
- `domain/value-objects/review-decision.ts` → `ReviewDecision = "merge" | "keep" | "more_info"` +
  `isReviewDecision(s)`. TDD.

## 3. Aplicación

`ports/review-queue-reader.ts`:
```ts
export interface ReviewFlag { patientId: string; name: string; document: string | null;
  reason: "document_conflict" | "pending_review"; }
export interface PatientBrief { id: string; name: string; document: string | null; }
export interface ReviewQueueReader {
  listOpenFlags(): Promise<ReviewFlag[]>;            // dedup_* sin review_resolved
  findByDocument(document: string): Promise<PatientBrief[]>;
  loadBriefs(): Promise<PatientBrief[]>;             // para recompute de zona gris
}
```

`use-cases/list-review-queue.ts` → `ListReviewQueue.execute()`:
- Por cada flag arma `ReviewCase { patientId, name, reason, candidates: PatientBrief[] }`:
  - `document_conflict` → `findByDocument(doc)` menos el propio id.
  - `pending_review` → `mostSimilarByName` sobre `loadBriefs()` (excluye el propio) → 1 candidato.
- **TDD** con fakes: conflicto trae candidatos por cédula; zona gris trae el más parecido; excluye
  el propio paciente.

`use-cases/resolve-review-case.ts` → `ResolveReviewCase.execute({ patientId, decision, candidateId,
actorId })`: valida `isReviewDecision` y registra el audit `review_resolved` (reusa el port
`AuditLog`). TDD: decisión inválida lanza; válida llama `audit.record` con el payload correcto.

## 4. Infraestructura

`DrizzleReviewQueueReader`:
- `listOpenFlags`: `audit_log` (acciones dedup_*) `JOIN patients` `WHERE NOT EXISTS (review_resolved
  del mismo entity_id)`; `reason` desde la acción; `document` desde `payload->>'document'` o la
  cédula del paciente.
- `findByDocument` / `loadBriefs`: sobre `patients`.
- Resolución: reusa `DrizzleAuditLog.record`.
Wiring en composition (`listReviewQueueUseCase`, `resolveReviewCaseUseCase`).

## 5. Presentación

- Server action `resolveReviewAction(patientId, decision, candidateId?)`: re-verifica
  **moderador** (getCurrentMember + canModerate), llama `ResolveReviewCase` con `actorId=member.id`,
  `revalidatePath("/admin/review")`.
- `/admin/(protected)/review/page.tsx` (moderador): lista de casos; cada uno muestra el registro
  nuevo + candidato(s) + 3 botones (**Fusionar** / **Mantener separados** / **Más info**) como forms.
  Estado vacío "no hay casos pendientes". Enlace **Revisión** en el nav (solo moderador).

## 6. Verificación

- TDD verde de `mostSimilarByName`, `isReviewDecision`, `ListReviewQueue`, `ResolveReviewCase`.
- `pnpm typecheck && pnpm test && pnpm build`. Query read-only de la cola contra prod (7 casos).

## 7. Fuera de alcance

**Ejecución de la fusión** (combinar pacientes/ingresos/sensibles) — PR siguiente. Filtros,
paginación, deshacer una resolución.
