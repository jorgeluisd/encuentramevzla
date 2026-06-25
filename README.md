# EncuéntrameVzla — Registro Hospitalario de Pacientes

**Proyecto:** EncuéntrameVzla · **Dominio:** `encuentramevzla.com`

> Proyecto humanitario, **sin fines de lucro**. Buscador con **privacidad mediada** que ayuda
> a cerrar el círculo de personas desaparecidas tras un terremoto en Venezuela: una familia
> busca por nombre y solo recibe *"hay una coincidencia en el Hospital X — mesa de información: [tel]"*,
> nunca datos personales del paciente.

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

## Estructura del monorepo

```
.
├── apps/
│   └── web/        Next.js (App Router, React 19, Tailwind 4) — buscador público + admin
├── packages/
│   ├── config/     tsconfig base + preset ESLint compartido
│   ├── db/         Drizzle ORM + tipos del esquema (schemas public / sensible)
│   └── ingesta/    librería TS pura: parseo Excel (SheetJS), normalización y dedup
└── supabase/
    ├── migrations/ SQL de Postgres 16 (extensiones, tablas, RLS, RPC buscar_paciente)
    └── functions/  Edge Functions (Deno) — `dedup` (worker fase 2, stub)
```

> **Arquitectura: todo Supabase.** No hay backend propio. El frontend (Next.js) habla
> directo con Supabase: el público solo invoca el RPC mediado `buscar_paciente`, y la
> ingesta usa Server Actions con la service role. El worker pesado de dedup/OCR de la
> fase 2 será una **Supabase Edge Function (Deno)** — ver `supabase/functions/dedup`.

## NOTA de privacidad — los datos se tratan de forma segura

La privacidad de los pacientes es un **requisito innegociable** del diseño:

- **Separación física público / sensible.** Hay dos *schemas* de Postgres:
  `public` (no sensible) y `sensible` (teléfonos, direcciones, observaciones clínicas).
  El rol anónimo **no tiene grants** sobre las tablas de datos; el schema `sensible`
  jamás es accesible desde el cliente.
- **Búsqueda mediada.** El público nunca consulta tablas directamente. Solo existe la
  función `public.buscar_paciente(termino)` (`SECURITY DEFINER`), que valida el término,
  hace el *matching* y devuelve únicamente `{ hospital_nombre, hospital_telefono_mesa, confianza }`.
  Si el match es un **menor de edad** o una persona **fallecida**, no se devuelve nada por el
  buscador: se entrega un marcador `{ requiere_contacto_humano: true }` para derivar a atención humana.
- **Anti-enumeración.** Se registra solo el **hash** del término buscado (`busqueda_log`),
  nunca el texto en claro. (Rate-limit previsto, ver TODO en el RPC.)
- **Derecho al olvido.** El dato crudo se preserva en `staging_filas` para trazabilidad, y el
  modelo permite la baja/anonimización de una persona y sus contactos sensibles.

> PWA preparado pero **sin Service Worker activo** todavía.
