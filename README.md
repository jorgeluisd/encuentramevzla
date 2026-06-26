# EncuéntrameVzla — Registro Hospitalario de Pacientes

**Proyecto:** EncuéntrameVzla · **Dominio:** `encuentramevzla.com`

**Redes:** Instagram [@encuentramevzla_](https://instagram.com/encuentramevzla_) ·
X [@encuentramevzl](https://x.com/encuentramevzl) ·
TikTok [@encuentrame.vzla](https://www.tiktok.com/@encuentrame.vzla)

> Proyecto humanitario, **sin fines de lucro**. Buscador con **privacidad mediada** que ayuda
> a cerrar el círculo de personas desaparecidas tras un terremoto en Venezuela: una familia
> busca por **nombre o cédula** y solo recibe *"hay una coincidencia en el Hospital X — mesa de
> información: [tel]"*, nunca datos personales del paciente.

> [!WARNING]
> **No es un servicio oficial de rescate.** Ante una emergencia llama a **171 / \*1 / 112 / 911**.

---

## Cómo levantar

```bash
pnpm install        # instala todo el workspace (usar SIEMPRE pnpm, nunca npm)
cp .env.example .env # completa tus claves de Supabase / Postgres
pnpm dev            # arranca apps en modo desarrollo (turbo)
```

Scripts raíz (turbo): `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Arquitectura y estructura

**Onion + Screaming Architecture.** Código en **inglés**, comentarios cortos en **español**,
**SDD + TDD** (specs primero en `specs/`, test primero). Las dependencias apuntan hacia adentro:
`apps/web → @evzla/db → @evzla/core`; el dominio no depende de nadie.

```
.
├── apps/
│   └── web/        @evzla/web — Next.js (App Router, React 19, Tailwind 4):
│                   presentación + composition root + infraestructura
│                   (adapters Drizzle/SheetJS/Supabase en lib/infrastructure)
├── packages/
│   ├── core/       @evzla/core — dominio + aplicación, PURO (sin I/O):
│   │               value objects, matching/dedup, ports y casos de uso
│   │               (IngestPatientList, SearchPatients)
│   ├── db/         @evzla/db — esquema Drizzle (schemas public / sensitive) + cliente Postgres
│   └── config/     @evzla/config — tsconfig base + preset ESLint
├── assets/
│   └── brand/      Logos definitivos (SVG master + PNG) — ver assets/brand/README.md
├── specs/          SDD — arquitectura, convenciones, dedup, design-system (0003), UI concept (0004)
└── supabase/
    ├── migrations/ SQL de Postgres 16 (extensiones, tablas, RLS, RPC search_patient)
    └── functions/  Edge Functions (Deno) — `dedup` (worker fase 2, stub)
```

> **Nota:** `docs/` está gitignored (contiene el Excel real de pacientes y el prototipo de UI/UX
> `docs/design/concept-mvp1.html`). Por eso los logos viven en `assets/brand/` y el diseño se documenta
> en `specs/` (ambos versionados).

## Diseño (mobile-first)

La UI se diseña **primero para celular** (la familia busca en una emergencia desde el teléfono) y luego
se amplía a desktop. Identidad y guía de UX:

- **Tokens** (paleta + tipografía Inter + principios mobile-first): `specs/0003-design-system.md`.
- **Concepto de pantallas y flujos** (público: buscador / coincidencia / sin resultados — privado:
  login magic-link / ingesta): `specs/0004-ui-concept.md`, destilado del prototipo de UI/UX.
- **Marca**: `assets/brand/` (logo SVG master + PNG).

> **Arquitectura: todo Supabase.** No hay backend propio. El frontend (Next.js) habla
> directo con Supabase: el público solo invoca el RPC mediado `search_patient`, y la
> ingesta usa Server Actions con la service role. El worker pesado de dedup/OCR de la
> fase 2 será una **Supabase Edge Function (Deno)** — ver `supabase/functions/dedup`.

## NOTA de privacidad — los datos se tratan de forma segura

La privacidad de los pacientes es un **requisito innegociable** del diseño:

- **Separación física público / sensible.** Hay dos *schemas* de Postgres:
  `public` (no sensible) y `sensitive` (teléfonos, direcciones, observaciones clínicas).
  El rol anónimo **no tiene grants** sobre las tablas de datos; el schema `sensitive`
  jamás es accesible desde el cliente.
- **Búsqueda controlada.** El público nunca consulta tablas directamente. Solo existe la
  función `public.search_patient(term)` (`SECURITY DEFINER`), que valida el término,
  hace el *matching* **por nombre o cédula** y, para **adultos vivos**, devuelve
  `{ hospital_name, info_desk_phone, patient_name, confidence }` (nombres agrupados
  por hospital — ver `[ADR-0002]`).
  Si el match es un **menor de edad** o una persona **fallecida**, **nunca** se devuelve el
  nombre: se entrega un marcador `{ requires_human_contact: true }` para derivar a atención humana.
- **Anti-enumeración.** Se registra solo el **hash** del término buscado (`search_log`),
  nunca el texto en claro. (Rate-limit previsto, ver TODO en el RPC.)
- **Derecho al olvido.** El dato crudo se preserva en `raw_rows` para trazabilidad, y el
  modelo permite la baja/anonimización de una persona y sus contactos sensibles.

> PWA preparado pero **sin Service Worker activo** todavía.

## Estado y pendientes

**MVP funcional desplegado en Vercel** (rama `main`). Arquitectura Onion + Screaming completa
(`@evzla/core` puro · `@evzla/db` · infra + composition en `@evzla/web`). 319 pacientes en
producción. Calidad: typecheck 4/4 · **77 tests** · build OK. Specs `0001`–`0010`; migraciones
`0001`–`0004`.

**Implementado:**
- **Buscador público** mobile-first: nombres de adultos vivos agrupados por hospital (opción
  "abierta", consentida por la residente); menores/fallecidos → contacto humano. RPC `search_patient`.
- **Diseño**: tokens oficiales (azul `#1565C0`, Inter), shadcn-style, banner de emergencia sticky,
  contacto real de la Cruz Roja.
- **Portal `/admin`**: auth **magic-link** (Supabase) + roles (`uploader`/`moderator`) por allow-list
  `team_members`; guard server-side; **audit log** (vista de moderador).
- **Cola de revisión humana** (`/admin/review`, moderador): triage de los 7 casos dudosos +
  **ejecución de la fusión** de pacientes (transaccional, hard delete del duplicado).

**Pendiente:**
- **Operativo (para que el equipo pruebe):** alta de los emails del equipo en `team_members` ·
  Redirect URLs del dominio de Vercel en Supabase · SMTP propio (el email por defecto tiene límite bajo).
- **Producto:** apartado público con todos los **números de emergencia** (Caracas y La Guaira).
- **Launch:** Cloudflare **Turnstile** + rate-limit del RPC · dominio `encuentramevzla.com` → Vercel.
- **Opcional:** Service Worker PWA · variantes de logo/Open Graph · extraer `@evzla/infrastructure` ·
  undo de fusión · CSV en ingesta · "Cargas recientes" persistida.
