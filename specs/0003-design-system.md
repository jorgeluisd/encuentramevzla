# 0003 — Design System (tokens, tipografía, mobile-first)

Estado: en progreso · Fuente: paleta + tipografía entregadas por UI/UX y el concepto `docs/design/concept-mvp1.html`.
Aplica a toda la UI de `apps/web`. **Mobile-first**: se diseña primero para celular y luego se amplía a desktop.

> Esta es documentación de diseño (no implementación). Cuando se construya, los tokens se llevan al
> `@theme` de Tailwind 4 en `apps/web/app/globals.css` (hoy tiene placeholders distintos — ver §7).

## 1. Tipografía

Entregada por UI/UX:

| Rol | Fuente | Peso |
|---|---|---|
| Títulos / headings | **Inter** | SemiBold (600) |
| Cuerpo / texto | **Inter** | Regular (400) |

- Familia única: **Inter** (con fallback `system-ui, sans-serif`).
- Inputs y botones heredan la familia (`font-family: inherit`).
- Tamaño mínimo en inputs: **16px** (evita el zoom automático en iOS).

> ⚠️ **Discrepancia a confirmar:** el prototipo `concept-mvp1.html` usa **Poppins**, no Inter. La
> entrega oficial de UI/UX dice **Inter** → se adopta **Inter**. Confirmar con UI/UX antes de codificar.

## 2. Paleta de colores (oficial)

Entregada por UI/UX (imagen "PALETA DE COLORES"). Roles semánticos asignados según el concepto:

| Token | Hex | Rol semántico |
|---|---|---|
| `primary` (azul) | `#1565C0` | Marca, acciones principales (Buscar), enlaces, headings. |
| `success` (verde) | `#2E7D32` | Coincidencia confirmada, "verificado", estado publicado. |
| `warning` (naranja) | `#F57C00` | En revisión / procesando / duplicados. |
| `danger` (rojo) | `#D32F2F` | Emergencia, Cruz Roja, botón "Llamar". |
| `muted` (gris) | `#757575` | Texto secundario / metadatos. |
| `surface-alt` (gris claro) | `#F5F5F5` | Fondos y superficies suaves. |

El azul `#1565C0` coincide con el del **logo real** (PNG/SVG), lo que confirma la paleta.

## 3. Neutrales y superficies (derivados del concepto)

El concepto usa una escala de neutrales que conviene formalizar (nombres tentativos):

| Token | Hex aprox. | Uso |
|---|---|---|
| `bg` | `#FFFFFF` | Fondo base. |
| `text` | `#1A2233` | Texto principal (casi negro azulado). |
| `text-2` | `#5A6478` | Texto secundario. |
| `text-3` | `#9AA3B2` | Texto terciario / placeholders. |
| `border` | `#E5E8EE` | Bordes de cards/inputs. |
| `surface` | `#F8F9FB` | Superficies de inputs/cards suaves. |

## 4. Acento de bandera (decorativo)

El concepto usa la franja tricolor de Venezuela como acento de marca (decorativo, no semántico):

| Color | Hex |
|---|---|
| Amarillo | `#FCD116` |
| Azul bandera | `#0033A0` |
| Rojo bandera | `#CF142B` |

> Uso decorativo (franja del header, detalles de marca). No usar como color de acción ni de estado.

## 5. Forma, elevación y espaciado (observado en el concepto)

- **Radios**: inputs/botones ~12–14px; cards ~18–20px; chips/badges 999px (píldora).
- **Sombra de card**: suave y azulada, p. ej. `0 12px 34px rgba(15,59,142,0.10)`.
- **Alturas de control**: inputs 52px, botón primario 54–58px (cómodos para el dedo).
- **Contenedores**: público ~760–1120px máx; privado ~430–1000px máx; centrados con padding lateral ~22px.
- **Espaciado**: usar la escala de Tailwind (múltiplos de 4px).

## 6. Principios mobile-first (innegociable para este proyecto)

El usuario primario busca a un familiar **desde el celular, en una emergencia**. Reglas:

1. **Diseñar primero el layout de 1 columna** (celular); ampliar a 2–3 columnas en breakpoints `md`/`lg`.
2. **Formulario de búsqueda apilado** en móvil (Nombre, Apellido, Cédula full-width); en fila a partir de `md`.
3. **Tarjetas de features**: 1 columna en móvil → 3 columnas en `md` (el concepto usa `repeat(3,1fr)`,
   que en móvil **debe** colapsar a 1).
4. **Tablas** (dashboard de cargas): scroll horizontal en móvil (`overflow-x:auto`), nunca romper el layout.
5. **Targets táctiles ≥ 44px**; inputs y botones del concepto ya cumplen (52–58px).
6. **Texto de inputs ≥ 16px** (anti-zoom iOS).
7. **Aviso de emergencia siempre visible** (sticky) con los teléfonos `171 · *1 · 112 · 911`.
8. **Rendimiento**: imágenes optimizadas, fuente con `font-display: swap`, PWA prevista (sin SW activo aún).
9. **Accesibilidad**: contraste AA, foco visible, labels asociados, estados `disabled` claros.

## 7. Pendientes / a alinear al construir

- Llevar estos tokens al `@theme` de `apps/web/app/globals.css` (hoy tiene placeholders `--color-marca:#0f766e`
  y `--color-alerta:#b91c1c`, que **no** corresponden a esta paleta → reemplazar por los tokens de §2–§4).
- Confirmar tipografía **Inter** vs Poppins del prototipo (§1).
- Definir breakpoints concretos y nombres finales de tokens al implementar (ver skill `.claude/skills/ui-tailwind.md`).
- Generar variantes de logo (icono, monocromo) — ver `assets/brand/README.md`.

> Decisiones de marca/paleta/tipografía relevantes se registran como memoria en Engram (tag `frontend`/`decision`).
