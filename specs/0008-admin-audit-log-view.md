# 0008 — Vista del audit log para moderador

Estado: **en progreso** · Rama: `feat/admin-audit-log` (desde `develop`).
Continúa el **alcance B** de auth (`0007`): la página para que un **moderador** vea el rastro
del `audit_log`. Capas: domain (etiquetas) · application (reader + use case) · infrastructure
(Drizzle) · presentation (`/admin/audit`, solo moderador).

> El `audit_log` ya se escribe (ingesta: `ingest_patient_list`, `dedup_document_conflict`,
> `dedup_pending_review`). Esta entrega solo **lee y muestra** el rastro; no cambia la escritura.

## 1. Dominio (TDD) — `auditActionLabel`

`domain/value-objects/audit-action.ts`:
- `auditActionLabel(action: string): string` → etiqueta legible en español.
  - `ingest_patient_list` → "Carga de lista".
  - `dedup_document_conflict` → "Conflicto de cédula".
  - `dedup_pending_review` → "Zona gris (a revisión)".
  - desconocida → la propia `action` (fallback, no rompe).

## 2. Aplicación — reader + use case

`application/ports/audit-log-reader.ts`:
```ts
export interface AuditRecord {
  id: string; action: string; entity: string;
  actorEmail: string | null; createdAt: Date;
}
export interface AuditLogReader { listRecent(limit: number): Promise<AuditRecord[]>; }
```

`application/use-cases/list-audit-log.ts` — `ListAuditLog.execute(limit?)`:
- **Clamp** del límite a `[1, 200]` (default 50) para no pedir de más. **TDD**: 0/negativo → 1;
  >200 → 200; vacío → 50.
- Delega en `reader.listRecent(clamped)`.

## 3. Infraestructura

`DrizzleAuditLogReader.listRecent(limit)`: `SELECT` de `audit_log` **LEFT JOIN** `team_members`
(actor email), `ORDER BY created_at DESC LIMIT n`. Se ejecuta server-side (Drizzle directo).

## 4. Presentación

- `lib/auth/current-member.ts`: `getCurrentMember()` (envuelto en `cache()` de React) →
  `{ kind: "anonymous" } | { kind: "unauthorized"; email } | { kind: "authorized"; member }`.
  Dedupe de la resolución por request. El **guard** del layout `(protected)` se refactoriza a usarlo
  (mismo comportamiento: anónimo → login; sin membresía → denegado). El layout añade el enlace a
  **Audit log** en el nav **solo si** `canModerate(member.role)`.
- `/admin/(protected)/audit/page.tsx` (server, `dynamic`): `getCurrentMember()`; si no es moderador
  → tarjeta "solo moderadores". Si lo es → tabla de registros (`Acción · Entidad · Quién · Fecha`)
  con `auditActionLabel`, scroll horizontal en móvil. Estado vacío explícito.

## 5. Verificación

- TDD verde de `auditActionLabel` y del clamp de `ListAuditLog`.
- `pnpm typecheck && pnpm test && pnpm build` verdes.
- Verificación local: uploader no ve el enlace ni la página (denegado); moderador sí.

## 6. Fuera de alcance

Filtros/paginación del audit, exportación, cola de revisión humana accionable (#3, aparte:
aquí solo se **ve** el rastro, no se resuelven los 7 casos).
