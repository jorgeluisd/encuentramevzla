# Skill — Frontend Next.js 16 (App Router, React 19, Server Actions)

`apps/web` (`@evzla/web`) es **presentación + composition root + infraestructura**. Es la capa externa
de la onion: aquí se inyectan los adapters en los casos de uso de `@evzla/core`.

## App Router (`apps/web/app/`)

- Estructura por rutas: `app/page.tsx`, `app/buscar/`, `app/confianza/`, `app/admin/ingesta/`.
- **Server Components por defecto** (RSC). Marca `"use client"` solo cuando necesites estado/efectos.
- `layout.tsx` global; `globals.css` importa Tailwind 4.
- Alias de import: `@/` → raíz de `apps/web` (p. ej. `@/lib/utils`, `@/lib/composition`).

## Composition root (`apps/web/lib/composition.ts`)

- Es el **único lugar** que arma los casos de uso con sus adapters concretos.
- `import "server-only"` al inicio (jamás se ejecuta en cliente).
- Patrón: una función por caso de uso que construye el use case con sus ports implementados.
  ```ts
  export function searchPatientsUseCase(): SearchPatients {
    return new SearchPatients(new SupabasePatientSearchGateway(createAnonClient()));
  }
  ```
- Los componentes/acciones **piden el caso de uso aquí**, no instancian adapters por su cuenta.

## Server Actions (`apps/web/lib/actions/`)

- Archivo con `"use server"` arriba. Reciben `FormData` y delegan en el caso de uso del composition root.
- Devuelven un estado serializable (`{ ok, mensaje?, resumen? }`) para `useActionState`.
- Validan input antes de ejecutar (p. ej. archivo `.xlsx` no vacío).
- La ingesta usa la **service role / conexión directa** (vía composition); el público nunca.
- TODOs vigentes: exigir sesión + rol (`uploader`/`moderador`) y registrar `uploadedBy` (auth pendiente).

## Infraestructura (`apps/web/lib/infrastructure/patient-registry/`)

Adapters que implementan los ports de `@evzla/core`:
- `sheetjs-patient-list-parser.ts` — parser Excel (SheetJS).
- `drizzle-repositories.ts` — repos sobre `@evzla/db`.
- `supabase-patient-search-gateway.ts` — invoca el RPC mediado.
- `status-mapping.ts`, `excel-parsing.ts` (con su `.test.ts`).

## Reglas

- ❌ No consultar la DB directamente desde un componente: pasa por un caso de uso (composition root).
- ❌ No importar `@evzla/db/client` ni adapters de servidor desde un componente cliente.
- ❌ El público nunca toca tablas: la búsqueda va por el gateway → RPC `search_patient`.
- ✅ Lógica de negocio en `@evzla/core`; la web solo orquesta y presenta.
- ✅ Estilo con Tailwind 4 + `cn()` (ver `ui-tailwind.md`).

## Estado / pendientes

UI shadcn/ui · auth magic-link + roles + audit en `/admin` · PWA preparado sin Service Worker activo.
