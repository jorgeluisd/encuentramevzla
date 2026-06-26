# Spec 0011 — Página pública de números de emergencia

Estado: **propuesto** · Capacidad: `emergency-contacts` · Depende de: 0003 (design system), 0006 (UI).

## 1. Motivación

Tras el sismo, las familias necesitan a mano los teléfonos oficiales de emergencia
(protección civil, bomberos, policía, sismos, desaparecidos). Hoy solo viven en el
banner sticky (171 · \*1 · 112 · 911). Falta una página pública, agrupada y mobile-first,
con todos los contactos y botones `tel:` clickeables, enlazada desde el footer y el banner.

Es información **pública y estática**: no toca datos de pacientes, ni el schema `sensitive`,
ni el RPC `search_patient`. Sin implicaciones de privacidad.

## 2. Alcance

- Nueva ruta pública **`/emergencias`** (App Router, RSC, sin auth).
- Contactos **agrupados** por categoría, cada uno con su(s) número(s) en enlace `tel:`.
- **Mobile-first**: tarjetas apiladas, números grandes y tocables (mín. 44px).
- Enlace a `/emergencias` desde el **footer** y desde el **banner de emergencia**.
- Datos estáticos en un módulo de presentación (`apps/web/app/emergencias/contacts.ts`).

Fuera de alcance: edición desde admin, geolocalización, datos dinámicos.

## 3. Datos (fuente: `docs/contactos emergencia.jpeg`, gitignored)

- **Líneas generales:** 911 (Emergencias/Movistar) · 171 (CANTV/fijos) · 112 (Digitel) · \*1 (Movilnet)
- **Protección Civil:** La Guaira 0424-2075335 · Caracas Central (0212) 575-1823 / (0212) 631-8662 ·
  Caracas Libertador 0800-725-3661 / (0212) 541-0830 · Nacionales 0800-5588427 / 0800-2668446
- **Bomberos:** La Guaira (0212) 332-7620 / (0212) 331-0445 ·
  Caracas Metropolitana (0212) 545-4545 / (0212) 542-0243
- **Seguridad / sismos / desaparecidos:** Policía Nacional 0800-765-4242 ·
  FUNVISIS (sismos) 0-800-TEMBLOR (0-800-836-2567) · app VENApp (desaparecidos) ·
  web "Desaparecidos Terremoto Venezuela"

## 4. Lógica de dominio (capa core, pura) — TDD

Único trozo testeable: convertir un número **mostrado** (con espacios, paréntesis, guiones,
`*`, prefijos) en un valor válido para `href="tel:…"`.

- Capacidad nueva en `@evzla/core`: `emergency-contacts/domain/phone.ts`.
- `telHref(raw: string): string`
  - Conserva dígitos, `+` inicial, `*` y `#` (códigos cortos GSM como `*1`).
  - Elimina espacios, guiones, paréntesis, puntos.
  - Devuelve la cadena con prefijo `tel:` (p. ej. `tel:02125751823`, `tel:*1`, `tel:+582125714380`).
- Sin I/O, sin libs externas (regla onion: `@evzla/core` puro).

## 5. UI / presentación

- `apps/web/app/emergencias/page.tsx` (RSC): hero corto + una `Card` por grupo.
- Cada contacto: etiqueta (zona/operadora) + número(s) como `<a href={telHref(n)}>` con estilo
  de botón/realce, usando tokens de marca existentes (`text-primary`, `text-danger`, etc.).
- VENApp / web de desaparecidos: texto informativo (no son teléfonos).
- Metadata `title`/`description` propias de la página.

## 6. Criterios de aceptación

1. `GET /emergencias` renderiza sin auth, con todos los grupos del §3.
2. Cada teléfono es un enlace `tel:` con el valor normalizado por `telHref`.
3. Footer y banner enlazan a `/emergencias`.
4. `telHref` cubierto por tests unitarios (TDD): dígitos, `(0212)`, guiones, `*1`, `+58…`.
5. `pnpm typecheck` 4/4 · `pnpm test` verde · `pnpm build` OK. No rompe lo verde.

## 7. Privacidad

No aplica tratamiento de datos sensibles. Información pública oficial. El banner y la página
no registran nada en `search_log`.
