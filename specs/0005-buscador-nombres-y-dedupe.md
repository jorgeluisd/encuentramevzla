# 0005 — Nombres en el buscador + dedupe por hospital

Estado: en diseño (GATE 1) · Capas: `application` (port) · `domain` (presentación de nombre) ·
infraestructura (RPC `0007` + gateway) · presentación (`/buscar`, `/confianza`).
Dirige el TDD de este incremento.

## Contexto y decisión

Hasta ahora la búsqueda era **mediada**: solo devolvía hospital + teléfono de mesa, nunca el
nombre del paciente (ADR-0001). El 2026-06-25, **con consentimiento explícito de la residente
(dueña del dato)**, se decide **abrir los nombres** (decisión "abierta", ver `[[ADR-0002]]`):

- Se muestran **NOMBRES de pacientes en toda coincidencia** (incluso parcial), **agrupados por
  hospital**.
- **Salvedad innegociable (CLAUDE.md §7, no se cruza):** **menores de edad y fallecidos NUNCA
  devuelven nombre** → siguen devolviendo `{ requires_human_contact: true }`. La apertura
  aplica **solo a adultos vivos**.
- `search_log` sigue guardando **solo el hash** del término (anti-enumeración intacta).
- El acceso público sigue siendo **únicamente** vía el RPC `public.search_patient`
  (`SECURITY DEFINER`); el rol anónimo no gana grants sobre tablas.

## Nombre visible (decisión de presentación)

Hoy `public.patients` solo guarda `normalized_name` (minúsculas, sin tildes). **No** se añade
columna ni se hace backfill. El nombre visible se obtiene **capitalizando el normalizado en
presentación** (title-case, sin tildes). Función **pura en `@evzla/core`**:

### `displayName(normalized: string): string`
- Title-case por palabra; colapsa espacios; deja vacío si la entrada es vacía.

**Criterios (TDD):**
- `displayName("perez garcia juan") === "Perez Garcia Juan"`.
- `displayName("maria jose rondon") === "Maria Jose Rondon"`.
- `displayName("") === ""`; `displayName("  juan  perez ") === "Juan Perez"`.

> Limitación aceptada: sin tildes ni mayúsculas internas reales (p. ej. "de la Cruz"). Es el
> trade-off elegido para evitar migración/backfill.

## Cambios por capa

### Dominio (`@evzla/core/patient-registry/domain`)
- Nuevo value object/función `displayName` (archivo `value-objects/display-name.ts` + test colocado).

### Application (port)
- `MediatedMatch` gana `patientName: string` (el **normalizado**; la capa de presentación lo
  pasa por `displayName`). El resto del puerto y los `kind` no cambian.

  ```ts
  export interface MediatedMatch {
    hospitalName: string;
    infoDeskPhone: string | null;
    patientName: string;   // nuevo: nombre normalizado del adulto coincidente
    confidence: number;
  }
  ```

### Infraestructura
- **Migración `0007_search_patient_nombres.sql`**: `CREATE OR REPLACE` del RPC para que el
  bloque publicable **incluya el nombre** en el jsonb y **dedupe por hospital+persona**:
  - Añadir `'patient_name', p.normalized_name` al `jsonb_build_object`.
  - Mantener el `GROUP BY h.nombre, h.info_desk_phone, p.normalized_name,
    p.normalized_doc_number` (un resultado por persona-hospital → no repite la misma persona en
    el mismo hospital; traslados quedan como ingresos distintos).
  - **Sin tocar** la rama sensible (menores/fallecidos → `requires_human_contact`), el umbral
    `v_best_sensible >= v_best_public`, ni el logging por hash.
  - El `LIMIT 10` se mantiene.
- **Gateway** `SupabasePatientSearchGateway`: mapear `patient_name → patientName`.

### Presentación
- `/buscar`: renderizar resultados **agrupados por hospital**; bajo cada hospital, la lista de
  nombres (`displayName(match.patientName)`) + el teléfono de mesa. Mantener el caso
  `human-contact` tal cual ("hay una coincidencia sensible, contacta a la mesa…").
- `/confianza`: actualizar la copy de "Búsqueda mediada" para reflejar que **sí** se muestran
  nombres de **adultos** y que **menores/fallecidos** siguen derivando a atención humana.

## Privacidad (checklist innegociable)
- [ ] Menores (`is_minor`) y fallecidos (`status='deceased'`) **nunca** aparecen con nombre.
- [ ] Único acceso público = RPC `search_patient` (`SECURITY DEFINER`); sin grants al anónimo.
- [ ] `search_log` solo guarda el hash; no se loggea el término ni el nombre devuelto.
- [ ] El schema `sensitive` (teléfonos/direcciones/clínico) **no** se toca ni se expone.

## Plan de tareas (post-GATE 1, Strict TDD ON)
1. **(core)** RED→GREEN `displayName` + test colocado.
2. **(core)** Extender `MediatedMatch` con `patientName` (ajustar tipos/fakes; tests verdes).
3. **(infra)** Migración `0007` + aplicarla; ajustar `SupabasePatientSearchGateway` (mapear nombre).
4. **(infra)** Test del adapter (parseo del nuevo campo).
5. **(web)** `/buscar`: agrupar por hospital + nombres con `displayName`.
6. **(web)** `/confianza`: copy nueva.
7. **(docs)** `[[ADR-0001]]` (status: parcialmente revertida) + `[[ADR-0002]]`; README al día.
8. Verificación: `pnpm typecheck && pnpm test && pnpm build` verdes + prueba manual del RPC.

## GATE 2 (al cerrar)
Evidencia "TDD Cycle Evidence" (RED FAIL → GREEN PASS con comandos Vitest reales) + checklist de
privacidad marcado + `/confianza` coherente con el comportamiento real.
