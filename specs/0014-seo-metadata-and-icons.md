# Spec 0014 — Favicon, metadata para compartir y SEO

Estado: **propuesto** · Capacidad: presentación (apps/web) · Relacionado: 0006 (UI), 0013.

## 1. Motivación

El sitio no tiene favicon ni metadata de compartido (Open Graph/Twitter), y el SEO es mínimo.
Además, una tarjeta del home prometía "te damos el teléfono de la mesa de información del
hospital", algo que **no** entregamos (solo indicamos el hospital; los teléfonos útiles son
los del aviso de emergencia superior). Se corrige el mensaje y se mejora el descubrimiento.

## 2. Alcance

1. **Favicon e iconos:** `app/icon.png` (512²) y `app/apple-icon.png` (180²), derivados del
   logo de marca. Next los enlaza automáticamente.
2. **Imagen de compartido:** `app/opengraph-image.png` (1200×630). Sirve para Open Graph y
   Twitter (Next la reutiliza).
3. **Metadata rica** en `app/layout.tsx`: `metadataBase`, `title` con template, `description`,
   `keywords`, `openGraph` (es_VE, website), `twitter` (summary_large_image), `robots`,
   `alternates.canonical`.
4. **SEO estructurado:** JSON-LD `WebSite` + `publisher` (NGO) en el layout.
5. **Corrección de copy:** la tarjeta "Teléfono de ayuda" pasa a "Dónde acudir" y deja de
   prometer un teléfono del hospital; remite a las líneas de emergencia del aviso superior.

## 3. Decisiones

- Iconos generados del logo (casi cuadrado, 1012×987) con padding a cuadrado. Si más adelante
  hay un isotipo dedicado, se reemplazan los `*.png` sin tocar código.
- OG estática (logo centrado sobre blanco) por fiabilidad; se puede sustituir por una pieza
  diseñada o por generación dinámica (`next/og`) en el futuro.

## 4. Fuera de alcance

PWA/manifest y `theme-color` avanzado (pendiente #6). Sitemap/robots.txt se puede añadir aparte.

## 5. Criterios de aceptación

1. El navegador muestra favicon; al compartir el enlace aparece título, descripción e imagen.
2. `<head>` incluye OG/Twitter y el `<script type="application/ld+json">`.
3. El home ya no promete un teléfono del hospital.
4. `pnpm typecheck` 4/4 · `pnpm build` OK.
