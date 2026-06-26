# Skill — Arquitectura (Onion + Screaming)

Migrado de `specs/0001-architecture-and-conventions.md`. Aplica a todo el código nuevo y a la migración.

## Principios

1. **Onion.** Dependencias hacia adentro: `presentation → infrastructure → application → domain`.
   El dominio no conoce a nadie.
2. **Screaming.** El primer nivel grita el negocio (capacidades), no el framework.
3. **Idioma.** Código en inglés; comentarios cortos en español ("por qué", no "qué").
4. **SDD.** Spec en `specs/NNNN-*.md` antes de codificar.
5. **TDD.** Rojo → verde → refactor.

## Capas

- **domain** — entidades, value objects, servicios de dominio. **Puro**: sin I/O, sin libs externas.
- **application** — casos de uso + **ports** (interfaces). Orquesta el dominio.
- **infrastructure** — **adapters** que implementan los ports (Drizzle/Postgres, Supabase, SheetJS).
- **presentation** — `apps/web` (Next.js) + composition root que inyecta adapters en los casos de uso.

**Regla de dependencia:** una capa solo importa hacia adentro. `domain` no importa `application`;
`application` no importa `infrastructure`; etc. Verificable en code review y por el `verifier`.

## Estructura (feature-sliced + onion)

```
packages/core/src/
  patient-registry/            <- capacidad
    domain/
      value-objects/           person-name.ts, document-id.ts, patient-status.ts
      services/                string-similarity.ts, patient-matching.ts
    application/
      ports/                   repositories.ts, patient-list-parser.ts, patient-search-gateway.ts
      use-cases/               ingest-patient-list.ts, search-patients.ts
  patient-search/              <- otra capacidad
  shared/
apps/web/                      <- presentation + composition root + infraestructura
  lib/composition.ts           <- composition root (inyecta adapters)
  lib/infrastructure/patient-registry/   <- adapters concretos
```

> Nota: hoy la **infraestructura vive en `apps/web/lib/infrastructure`** (no en `packages/core`).
> Extraerla a un `@evzla/infrastructure` es opcional y requiere spec. No la metas en `@evzla/core`.

## Convención de nombres

- Capacidades/archivos: `kebab-case` (`patient-registry`, `string-similarity.ts`).
- Clases/tipos: `PascalCase` (`PersonName`, `PatientRepository`).
- Funciones/variables: `camelCase` (`normalizeName`, `matchScore`).
- Ports: sustantivo de rol (`PatientRepository`, `PatientSearchGateway`).
- Casos de uso: verbo + objeto (`IngestPatientList`, `SearchPatients`).

## Dominio de deduplicación (de `specs/0002`)

El matching **no confía en la cédula** como clave única (50% sin cédula, cédulas basura, cédulas
iguales con personas distintas). Value objects y servicios puros:

- `PersonName.fromRaw(raw)` — normaliza (sin acentos, minúsculas, sin puntuación, espacios colapsados);
  `tokens` token-set ordenado; `isEmpty`.
- `DocumentId.fromRaw(raw)` — alfanumérico mayúsculas; `isValid` solo con ≥6 dígitos.
- Similitud: `levenshtein`, `trigrams`, `trigramSimilarity`, `tokenSetSimilarity` — puras en [0,1]
  (espejo de `pg_trgm`/`fuzzystrmatch`).
- Política de decisión: cédula válida + nombre ≥0.5 → **merge**; misma cédula + nombre distinto →
  **conflict** (revisión humana); sin cédula: nombre ≥0.92 → merge, 0.80–0.92 → review, resto → new.

## Migración por estrangulamiento (estado)

Incrementos 1–5 ✅ (domain → application → infrastructure → recableado web → rename `@registro/*`→`@evzla/*`).
Pendiente menor: renombrar a inglés los identificadores Drizzle (las **columnas SQL no cambian**).
Convive el código nuevo (`@evzla/core` puro) con lo que alimenta la app; no rompas lo verde al migrar.

## Checklist al escribir código

- [ ] ¿La dependencia apunta hacia adentro? (`domain` no importa afuera)
- [ ] ¿Está en la capacidad correcta (`patient-registry` / `patient-search` / `shared`)?
- [ ] ¿Naming en inglés según la convención?
- [ ] ¿`@evzla/core` sigue puro (sin I/O ni libs externas)?
- [ ] ¿Hay test colocado y spec si es feature?
