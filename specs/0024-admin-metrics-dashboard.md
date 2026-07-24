# Spec 0024 — Dashboard de métricas en /admin

Estado: **borrador (Gate 1)** · Rama: `feat/0024-admin-metrics-dashboard` (desde `develop`)
Depende de: 0007 (auth/roles), 0008 (audit log), 0009 (cola de revisión), 0020/ADR-0009 (procedencia),
0016 (search_log rate-limit), 0018 (search_log retención).

## 1. Motivación

Tras la reconciliación (ADR-0008/0009) hay ~10.654 pacientes, 33 hospitales (7 provisionales) y
~1.329 casos en cola. Hoy no hay forma de ver el estado agregado del sistema sin correr SQL a mano.
Se pide una sección **`/admin/metricas`** (solo moderador, `force-dynamic`) con los números clave y
gráficos, **filtrable por hospital**, para operar y para priorizar el cierre de la Fase 3.

## 2. Regla de privacidad (INNEGOCIABLE)

- **Solo AGREGADOS.** Ni una sola fila de paciente, nombre, cédula, teléfono ni nada de `sensitive`
  llega a esta página. Se devuelven **conteos, porcentajes y series** — nunca identificadores de
  persona ni PII.
- Página bajo `(protected)`, `dynamic = "force-dynamic"`, gateada por `canModerate` (igual que
  `/admin/audit` y `/admin/hospitales`). No expuesta al público.
- `search_log` ya guarda **solo hash** (`term_hash`) — de él salen únicamente conteos por
  `result_type` y volumen temporal. **Nunca** se lee ni se muestra término alguno.
- No se conceden grants nuevos al rol anónimo. Todo el I/O va por el cliente directo `getDb()`
  (server-only), nunca por supabase-js/PostgREST.
- Checklist de `privacy-and-security.md` revisado en Gate 1 y Gate 2.

## 3. Alcance — métricas a mostrar

Todas las secciones respetan el **filtro por hospital** (opcional), salvo Búsquedas (global, ver §3.5).
El filtro agrega por **centro canónico** (los `hospitals` ya están colapsados vía `hospital_aliases`;
la relación paciente↔hospital se resuelve por `admissions`).

### 3.1 Pacientes
- Total; con cédula / sin cédula (`normalized_doc_number` null); menores (`is_minor`); fallecidos
  (`status='deceased'`); desglose por `status` (`admitted|transferred|discharged|located|deceased`).

### 3.2 Por hospital
- Ranking de hospitales por nº de pacientes; por cada uno: pacientes, sin cédula, menores.
- Hospitales **sin pacientes** (lista aparte). Marcar los **provisionales** (esperan confirmación).
- **Decisión (Gate 1):** los hospitales `test = true` **sí se cuentan** en los agregados
  (visibilidad total para el moderador; los totales cuadran con los conteos crudos de prod) pero se
  **marcan** visualmente (`· prueba`), igual que los provisionales (`· provisional`). Es un panel
  interno moderador-only, no una cifra pública.

### 3.3 Cola de revisión
- Abiertos totales; desglose por tipo (`dedup_document_conflict` vs `dedup_pending_review`).
- Por hospital cuando el filtro está activo (scope vía `admissions`, como en spec 0009).
- Fuente: derivada de `audit_log` (no hay tabla `review_queue`); "abierto" = sin `review_resolved`
  posterior para ese `entity_id`.

### 3.4 Cobertura de datos
- % de registros sin cédula, % sin edad (`age` null). Sobre el conjunto filtrado.

### 3.5 Búsquedas (`search_log`) — GLOBAL, no filtrable por hospital
- Volumen total; serie temporal por día/semana (`date_trunc` en SQL, con zero-fill de huecos).
- Tasa de acierto por `result_type`: `matches | no_results | requires_human_contact |
  invalid_term | rate_limited`. **Solo conteos** (no hay términos, solo hash).
- Rango temporal seleccionable (preset: 7d / 30d / 90d; retención real 90 días).

### 3.6 Procedencia
- Pacientes provenientes de la reconciliación: `patient_provenance` × `ingest_batch.kind`
  (`reconciliation_import` / `reconciliation_enrich`), desglose por `source_kind` (`import`/`enrich`)
  y por lote. Filtrable por hospital vía `admissions`.

## 4. Diseño (hexagonal)

Las piezas de dominio/aplicación cuelgan de **`patient-registry`** en `@evzla/core` (consistente con
`audit`/`review-queue`, decisión de Gate 1). El dominio no conoce la BD.

### 4.1 `@evzla/core` — `packages/core/src/patient-registry/`
- **domain/** — tipos de vista (`AdminMetricsView` y sub-tipos) + servicios **puros** TDD:
  - `compute-coverage.ts` — % sin cédula / sin edad a partir de conteos.
  - `rank-hospitals.ts` — orden desc por pacientes; separa los de cero.
  - `search-hit-rate.ts` — tasas por `result_type`; zero-fill de la serie temporal.
- **application/**
  - `ports/metrics-reader.ts` — puerto `MetricsReader`. Devuelve **agregados crudos** (DTOs de
    conteos/filas/series), nunca PII. Métodos scopeados por `hospitalId?: string | null`:
    `patientCounts`, `hospitalBreakdown`, `reviewQueueCounts`, `coverage`, `provenanceCounts`,
    y `searchStats(range, granularity)` (global).
  - `use-cases/get-admin-metrics.ts` — `GetAdminMetrics.execute({ hospitalId?, searchRange, granularity })`:
    llama al puerto y compone `AdminMetricsView` aplicando los servicios puros (porcentajes, ranking,
    hit-rate, zero-fill). Es lo que se testea en TDD con un `MetricsReader` fake.

### 4.2 `apps/web` — infraestructura y presentación
- **Adapter** `apps/web/lib/infrastructure/metrics/drizzle-metrics-reader.ts` implementa
  `MetricsReader` con `getDb()`. Usa Drizzle select para `patients/admissions/hospitals` y
  `db.execute(sql\`...\`)` para lo que no está en Drizzle (`search_log`, `ingest_batch`,
  `patient_provenance`, cola derivada de `audit_log`). **Gotcha:** `count`/`max` de postgres.js
  vuelven como string → castear `::int` en SQL. Adapter fino, sin lógica de dominio.
- **Composition root**: factory `adminMetricsUseCase()` en `apps/web/lib/composition.ts`.
- **Página** `apps/web/app/admin/(protected)/metricas/page.tsx` (server component,
  `dynamic = "force-dynamic"`, gate `canModerate`). Lee `searchParams`: `?hospital=<id>&range=7d|30d|90d`.
  `loading.tsx` con skeletons. Ítem de nav "Métricas" (solo moderador) en `(protected)/layout.tsx`.
- **Filtro por hospital** reutilizable: `_components/hospital-filter.tsx` (select de centros canónicos
  del `hospitalBreakdown`) que actualiza `searchParams`.

### 4.3 Gráficos — SVG propio (sin dependencia nueva)
Componentes en `apps/web/components/charts/` (o `metricas/_components/`), en **SVG a mano**, cableados
a los tokens del design system (`--color-primary/danger/warning`, `text-text/2/3`, `bg-surface`,
`border-border`); **dark mode** por tokens. Siguiendo la skill `dataviz`:
- `stat-tile.tsx` — número KPI (hero) con etiqueta y sub-dato.
- `bar-list.tsx` — ranking horizontal (hospitales), barras finas con extremo redondeado 4px.
- `stacked-bar.tsx` / `breakdown.tsx` — desglose por status / result_type / source_kind.
- `line-chart.tsx` — serie temporal de búsquedas (2px, crosshair+tooltip).
- **Accesibilidad**: leyenda para ≥2 series, identidad nunca solo por color, y **fallback de tabla**
  (`<details>`) por sección. Paleta validada con el validador de `dataviz` antes de cerrar Gate 2.

## 5. Fuera de alcance
- Vista acotada para `hospital_admin` (v1 = solo moderador, vista global). Mejora futura.
- Export CSV/PDF de las métricas (posible follow-up).
- Métricas en tiempo real / auto-refresh (la página ya es `force-dynamic` por request).
- Cualquier drill-down que muestre filas de pacientes (violaría §2).

## 6. Testing
- **TDD en `@evzla/core`** (grueso): servicios puros (`compute-coverage`, `rank-hospitals`,
  `search-hit-rate` con zero-fill) y `GetAdminMetrics` con `MetricsReader` fake — asertar
  porcentajes, orden del ranking, detección de hospitales en cero, hit-rate, passthrough del filtro
  de hospital y del rango temporal.
- Adapter Drizzle: fino; verificación manual **solo-lectura** contra prod (con los conteos ya
  conocidos: 10.654 pacientes, 3.663 c/cédula, 1.946 menores, 107 fallecidos, etc.) como sanity check.
- Verde antes de PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

## 7. Sin migración de DB
No se crean ni alteran tablas. Todo se lee de lo existente (`patients`, `admissions`, `hospitals`,
`hospital_aliases`, `audit_log`, `search_log`, `ingest_batch`, `patient_provenance`).
