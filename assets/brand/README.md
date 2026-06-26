# Marca — EncuéntrameVzla

Logos **definitivos** del proyecto. Fuente de verdad de la identidad visual.

> Estos assets sí se versionan (no son sensibles). Viven fuera de `docs/`, que está gitignored
> por contener el Excel real de pacientes.

## Archivos

| Archivo | Formato | Dimensiones | Uso |
|---|---|---|---|
| `logo-encuentramevzla.svg` | SVG vectorial | viewBox 1440×810 | **Master escalable** — preferido en web (nav, header, hero). |
| `logo-encuentramevzla.png` | PNG raster | 1254×1254 | Fallback / redes / favicons / Open Graph. |

Ambos son el **lockup vertical completo**: pin de ubicación con dos figuras formando un corazón rojo,
wordmark `encuentrameVZLA`, tagline `TE ENCONTRAMOS, ESTAMOS CONTIGO.` y franja tricolor de Venezuela.

## Pendiente (no creado aún — etapa de planificación)

- Variante **icono-only** (solo el pin) para favicon / app icon / espacios chicos.
- Variante **monocromática** (1 color) para fondos oscuros.
- SVG **optimizado y recortado** (el master tiene canvas apaisado con espacio en blanco).
- Cuando se construya la UI, exponer los assets necesarios en `apps/web/public/` (no se hace todavía).

Tokens de color y tipografía de marca: ver `specs/0003-design-system.md`.
