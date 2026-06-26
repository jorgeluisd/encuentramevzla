# 0001 — Arquitectura y convenciones (constitución)

Estado: aceptado · Aplica a todo el código nuevo y a la migración del existente.

## Principios

1. **Onion Architecture.** Las dependencias apuntan hacia adentro:
   `presentation → infrastructure → application → domain`. El dominio no conoce a nadie.
2. **Screaming Architecture.** La estructura de carpetas grita el negocio, no el framework.
   El primer nivel son **capacidades** (no "controllers"/"services").
3. **Idioma.** Todo el **código en inglés** (variables, funciones, clases, archivos, tipos).
   **Comentarios cortos en español**, solo donde aporten ("por qué", no "qué").
4. **SDD.** Cada feature parte de un spec en `specs/` antes de codificar.
5. **TDD.** Test primero (rojo) → implementación mínima (verde) → refactor.

## Capas (onion)

- **domain** — entidades, value objects y servicios de dominio. Puro, sin I/O ni libs externas.
- **application** — casos de uso + **ports** (interfaces). Orquesta el dominio.
- **infrastructure** — **adapters** que implementan los ports (Drizzle/Postgres, Supabase, SheetJS).
- **presentation** — `apps/web` (Next.js) + composition root (inyecta adapters en casos de uso).

Regla de dependencia: una capa solo importa hacia adentro. `domain` no importa `application`, etc.

## Estructura objetivo (feature-sliced + onion)

```
packages/core/src/
  patient-registry/            <- capacidad
    domain/
      value-objects/
      entities/
      services/
    application/
      ports/
      use-cases/
    infrastructure/            <- adapters de esta capacidad
  patient-search/
    domain/ application/ infrastructure/
  shared/
apps/web/                      <- presentation + composition root
```

## Convención de nombres (inglés)

- Capacidades/archivos: `kebab-case` (`patient-registry`, `string-similarity.ts`).
- Clases/tipos: `PascalCase` (`PersonName`, `PatientRepository`).
- Funciones/variables: `camelCase` (`normalizeName`, `matchScore`).
- Ports: sustantivo de rol (`PatientRepository`, `PatientSearchGateway`).
- Casos de uso: verbo + objeto (`IngestPatientList`, `SearchPatients`).

## Plan de migración (estrangulamiento, sin romper lo verde)

1. **domain** de `patient-registry` (matching + value objects) con TDD. ← este incremento.
2. **application**: ports + casos de uso (`IngestPatientList`, `SearchPatients`).
3. **infrastructure**: adapters Drizzle/Supabase/SheetJS implementando los ports.
4. Recablear `apps/web` al composition root; eliminar `@registro/ingesta` y mover el esquema.
5. Renombrar el scope `@registro/*` → `@evzla/*`.

Mientras tanto conviven el código viejo (que sigue alimentando la app) y el nuevo `@evzla/core`.
