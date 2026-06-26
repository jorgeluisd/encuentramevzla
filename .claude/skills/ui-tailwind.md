# Skill — UI con Tailwind 4 + shadcn/ui

Estilado del frontend. Tailwind **4** (sin `tailwind.config.js`) + componentes estilo **shadcn/ui**.
**Tokens oficiales** (paleta + tipografía + mobile-first) en `specs/0003-design-system.md`; concepto de
pantallas en `specs/0004-ui-concept.md`. **Mobile-first siempre** (layout de celular primero).

## Tokens de marca (de specs/0003)

- **Tipografía: Inter** (títulos SemiBold 600, cuerpo Regular 400). Inputs ≥16px (anti-zoom iOS).
- **Paleta**: `primary #1565C0` · `success #2E7D32` · `warning #F57C00` · `danger #D32F2F` ·
  `muted #757575` · `surface-alt #F5F5F5`. Acento bandera (decorativo): `#FCD116 #0033A0 #CF142B`.
- ⚠️ El `@theme` actual de `globals.css` tiene placeholders (`#0f766e`/`#b91c1c`) que **no** son estos
  tokens → reemplazar al construir. El prototipo usa Poppins/navy; la guía oficial manda (Inter + #1565C0).

## Tailwind 4

- Se importa con `@import "tailwindcss";` en `apps/web/app/globals.css`.
- El **tema se define con `@theme`** (variables CSS), no con `tailwind.config.js`:
  ```css
  @theme {
    --color-marca: #0f766e;
    --color-alerta: #b91c1c;
  }
  ```
- PostCSS: `@tailwindcss/postcss`.
- Usa tokens del tema como utilidades (`bg-marca`, `text-alerta`) en vez de hex sueltos cuando aplique.
- ❌ No metas `var(--...)` crudo dentro de `className`; usa utilidades de Tailwind o el token `@theme`.

## Helper `cn()` (`apps/web/lib/utils.ts`)

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```
Úsalo siempre para componer clases condicionales sin conflictos de Tailwind.

## Componentes (estilo shadcn/ui)

- Viven en `apps/web/components/ui/` (hoy: `button.tsx`).
- Patrón: props tipadas, `variant` opcional, clases compuestas con `cn(...)`, `className` al final para
  permitir override:
  ```tsx
  <button
    className={cn(
      "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
      variant === "primary" && "bg-teal-700 text-white hover:bg-teal-800",
      className,
    )}
    {...props}
  />
  ```
- React 19: componentes tipados (`React.ReactElement`), sin `useMemo`/`useCallback` innecesarios.

## Reglas

- ✅ Componer con `cn()`; `className` override al final.
- ✅ Colores de marca por token `@theme` cuando exista.
- ✅ Accesibilidad: estados `disabled`, foco visible, contraste suficiente (proyecto sensible).
- ❌ Sin `tailwind.config.js` (Tailwind 4 usa `@theme`).
- ❌ Sin librerías de UI fuera de shadcn/ui sin spec.

## Pendiente

Completar el set shadcn/ui (hoy solo `button`). UI del buscador y `/confianza` con cuidado de
**no mostrar datos sensibles** (ver `privacy-and-security.md`).
