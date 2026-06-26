# 0006 — Implementación de la UI (mobile-first)

Estado: **en progreso** · Rama: `feat/ui-mobile-first` (desde `develop`).
Fuentes: `specs/0003-design-system.md` (tokens) + `specs/0004-ui-concept.md` (pantallas/flujos).
Capas tocadas: **presentación** (`apps/web`) + un helper **puro** en `@evzla/core`.

> Spec de **implementación**: baja el concepto (0004) y los tokens (0003) a archivos concretos,
> componentes y estados. **Mobile-first** (se diseña primero el layout de 1 columna). No cambia el
> contrato del RPC ni el caso de uso `SearchPatients`.

## 0. Decisiones que fija este spec

- **Tipografía:** **Inter** (familia única, fallback `system-ui`), vía `next/font/google` con
  `display: "swap"`. Descarta Poppins del prototipo. (Confirmado por Jorge 2026-06-26.)
- **Azul primario:** `#1565C0` (coincide con el logo real). Descarta el navy `#0f3b8e`.
- **shadcn/ui sin CLI:** el proyecto NO tiene `components.json`; ya hay `components/ui/button.tsx`
  hecho a mano con `cn()` (clsx + tailwind-merge). Se mantiene ese patrón "shadcn-style" y se
  añaden a mano `input`, `card`, `badge`. No se corre `shadcn init` (evita churn/config nueva).
- **Buscador de 3 campos (Opción A):** la card de búsqueda muestra **Nombre · Apellido · Cédula
  (opcional)**; en el front se combinan en el **único** `termino` que ya consume el RPC, mediante
  un helper **puro testeado** `buildSearchTerm()`. Cero cambios en el contrato del RPC.
- **Resultados con nombres:** a diferencia del concepto 0004 (que no mostraba nombres), aquí
  **sí** se muestran nombres de adultos vivos agrupados por hospital (decisión abierta ya
  implementada, `[[spec-0005]]`). Menores/fallecidos → estado de contacto humano, sin nombre.

## 1. Tokens al `@theme` (Fase 1)

`apps/web/app/globals.css` — reemplazar los placeholders `--color-marca`/`--color-alerta` por la
paleta oficial de 0003 §2–§4. Nombres de token (Tailwind 4 los expone como `bg-*`, `text-*`, etc.):

| Token | Hex | Token | Hex |
|---|---|---|---|
| `--color-primary` | `#1565C0` | `--color-bg` | `#FFFFFF` |
| `--color-success` | `#2E7D32` | `--color-text` | `#1A2233` |
| `--color-warning` | `#F57C00` | `--color-text-2` | `#5A6478` |
| `--color-danger` | `#D32F2F` | `--color-text-3` | `#9AA3B2` |
| `--color-muted` | `#757575` | `--color-border` | `#E5E8EE` |
| `--color-surface` | `#F8F9FB` | `--color-surface-alt` | `#F5F5F5` |
| `--color-flag-yellow` | `#FCD116` | `--color-flag-blue` | `#0033A0` |
| `--color-flag-red` | `#CF142B` | | |

- **Inter** cargado en `layout.tsx` con `next/font` (`display: "swap"`), variable aplicada al `<html>`.
- **Inputs ≥ 16px** (anti-zoom iOS), `font-family: inherit`.
- Radios: inputs/botones ~12–14px, cards ~18–20px, chips 999px. Sombra de card azulada
  (`0 12px 34px rgba(15,59,142,0.10)`). Alturas: inputs 52px, botón primario 54–58px.

## 2. Componentes y shell (Fase 2)

**Componentes `apps/web/components/ui/`** (patrón `cn()`, sin libs nuevas):
- `button.tsx` — actualizar a tokens: variantes `primary` (azul), `outline`, `danger` (rojo, para "Llamar").
- `input.tsx` — alto 52px, texto ≥16px, borde `border`, foco visible (ring `primary`).
- `card.tsx` — `Card` + subpartes simples (radio ~18px, sombra suave, borde `border`).
- `badge.tsx` — píldora; variantes `success`/`warning`/`danger`/`muted`/`primary`.

**Shell común `apps/web/app/layout.tsx`:**
- **Header**: logo (`assets/brand` → copiar a `apps/web/public/`) + wordmark `encuentrameVZLA` +
  **franja tricolor** decorativa (amarillo/azul/rojo bandera). Nav: `Inicio · Cómo funciona ·
  Hospitales · Soy voluntario` — en móvil se simplifica/colapsa (no menú complejo: links esenciales).
- **Banner de emergencia sticky** (componente `EmergencyBanner`): *"Portal exclusivamente
  informativo. Para emergencias: 171 · *1 · 112 · 911"*. Siempre visible.
- **Footer**: nota humanitaria + enlace a `/confianza`.
- Contenedor público centrado, máx. ~1120px, padding lateral ~22px.

## 3. Páginas públicas (Fase 3)

### 3.1 Helper puro `buildSearchTerm` (en `@evzla/core`, TDD)

`buildSearchTerm(input: { nombre?: string; apellido?: string; cedula?: string }): string`

Reglas (decisión Opción A):
- Si `cedula` viene con contenido (tras `trim`), **gana** y se devuelve sola (la búsqueda por
  documento es más precisa).
- Si no, se combinan `nombre` + `apellido` con un espacio, colapsando espacios y `trim`.
- Devuelve `""` si no hay nada útil (la página muestra `invalid-term` igual que hoy con <4 chars).

**Criterios (TDD):**
- `buildSearchTerm({ nombre: "juan", apellido: "perez" }) === "juan perez"`.
- `buildSearchTerm({ nombre: "juan", apellido: "perez", cedula: "12345678" }) === "12345678"`.
- `buildSearchTerm({ cedula: "  V-12.345  " }) === "V-12.345"` (trim, sin más normalización aquí).
- `buildSearchTerm({ nombre: "  ", apellido: "" }) === ""`.
- `buildSearchTerm({ nombre: "  maria  jose ", apellido: " rondon " }) === "maria jose rondon"`.

> El RPC sigue recibiendo un solo `termino`; la normalización profunda (tildes/minúsculas) ya vive
> en el caso de uso/RPC. Este helper solo **arma** el término desde 3 campos de UI.

### 3.2 `/` — Buscador (concepto A1)

- Badge de confianza *"Listas verificadas · actualizado hoy"*.
- Título **"Encuentra a tu familiar"** + subtítulo *"Busca a una persona ingresada en un hospital
  tras el sismo. Es privado y seguro."*
- **Card de búsqueda**: campos **Nombre**, **Apellido**, **Cédula (opcional)**. Móvil: apilados
  full-width; desde `md`: en fila. Botón **BUSCAR** (azul, 54–58px). Submit `GET /buscar` con el
  `termino` ya combinado (form client component que arma el término con `buildSearchTerm`).
  - Reaseguro: *"Solo verás el hospital y un teléfono de ayuda. Nada de datos médicos."*
- **3 tarjetas "cómo funciona"**: *Listas unidas · Datos cuidados · Teléfono de ayuda*
  (1 col móvil → 3 col `md`).
- **CTA Cruz Roja**: *"¿No encuentras a tu familiar? La Cruz Roja también te ayuda a buscar."* + tel.

### 3.3 `/buscar` — Resultados (concepto A2/A3, con nombres)

Estados del caso de uso `SearchPatients` (sin cambios de lógica, solo presentación):
- **`matches`**: encabezado *"Resultados para {término}"* + **← Nueva búsqueda**. Badge verde con
  conteo. Por cada hospital: `Card` con rótulo *"Institución hospitalaria"* + **nombre del
  hospital** + lista de **nombres** + **teléfono de mesa** + botón **Llamar** (rojo `danger`,
  `tel:`). Nota de privacidad *"No mostramos diagnóstico, edad ni dirección…"*.
- **`no-results`**: mensaje de **esperanza** (texto de 0004 A3) + CTA Cruz Roja.
- **`human-contact`** (menores/fallecidos): card de derivación a atención humana, **sin nombre**.
  *"Las noticias delicadas siempre las da una persona, nunca la app."*
- **`invalid-term`**: aviso *"Escribe al menos 4 caracteres"* + volver.

### 3.4 `/confianza` — restyle

Mismo contenido (separación de datos, búsqueda mediada, anti-abuso, derecho al olvido) con el
sistema de diseño: tipografía, `Card` por sección, colores de token.

## 4. Privado (Fase 4)

### `/admin/ingesta` — restyle (SIN auth)

⚠️ La **autenticación** (magic-link + roles) es una tarea **separada** (pendiente #2). Aquí solo se
restiliza la página existente: aviso de área restringida (`warning`), `input` de archivo, botón,
mensaje de error (`danger`) y el **resumen de procesamiento** en `Card` con grilla legible en móvil.

**Tabla "Cargas recientes" (concepto B2) — por sesión.** Columnas `Archivo · Subido por ·
Registros · Fecha · Estado` con **scroll horizontal** en móvil (`overflow-x-auto`, `min-w`). La
tabla arranca **vacía** y se actualiza con cada carga de la sesión actual (estado de cliente, sin
persistir). El estado se decide con el helper puro `ingestionDisplayStatus(summary)`:
- `published` → **Publicada** (`success`).
- `review` → **En revisión (N)** (`warning`) si hay conflictos de cédula o zona gris.
- el error de procesamiento → **Formato inválido** (`danger`).

`Subido por` va vacío (`—`) hasta que exista auth (sabremos `uploadedBy`).

> La tabla **histórica/persistida del equipo** (entre sesiones, con `Subido por` real) requiere
> auth + una tabla de cargas en DB → queda para cuando llegue el pendiente #2.

## 5. Mobile-first (innegociable, 0003 §6)

1 columna en móvil → `md`/`lg` multicolumna · form apilado → fila en `md` · 3 cards → 1 col móvil ·
targets ≥44px · inputs ≥16px · banner de emergencia sticky · contraste AA, foco visible, labels
asociados.

## 6. Verificación (Fase 5)

- TDD real del helper `buildSearchTerm` (RED→GREEN, evidencia Vitest).
- `pnpm typecheck && pnpm test && pnpm build` verdes (objetivo 4/4 paquetes).
- Dev server + capturas móvil y desktop para validación visual de Jorge.

## 7. Fuera de alcance

Auth/roles (#2), cola de revisión humana (#3), Turnstile/rate-limit (#4), variantes de logo,
Service Worker PWA, **tabla de cargas persistida entre sesiones** (la de esta entrega es por
sesión), soporte `.csv` en ingesta.
