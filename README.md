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
cp .env.example .env # completa DATABASE_URL (Postgres local) y las claves de dev
pnpm dev            # arranca apps en modo desarrollo (turbo)
```

Scripts raíz (turbo): `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
Bundle para AWS Lambda (OpenNext): `pnpm --filter @evzla/web build:aws` → `apps/web/.open-next/`.

## Arquitectura y estructura

**Onion + Screaming Architecture.** Código en **inglés**, comentarios cortos en **español**,
**SDD + TDD** (specs primero en `specs/`, test primero). Las dependencias apuntan hacia adentro:
`apps/web → @evzla/db → @evzla/core`; el dominio no depende de nadie.

```
.
├── apps/
│   └── web/        @evzla/web — Next.js (App Router, React 19, Tailwind 4):
│                   presentación + composition root + infraestructura
│                   (adapters Drizzle/SheetJS/Cognito/S3 en lib/infrastructure)
├── packages/
│   ├── core/       @evzla/core — dominio + aplicación, PURO (sin I/O):
│   │               value objects, matching/dedup, ports y casos de uso
│   │               (IngestPatientList, SearchPatients)
│   ├── db/         @evzla/db — esquema Drizzle (schemas public / sensitive) + cliente Postgres por rol
│   └── config/     @evzla/config — tsconfig base + preset ESLint
├── assets/
│   └── brand/      Logos definitivos (SVG master + PNG) — ver assets/brand/README.md
├── specs/          SDD — arquitectura, convenciones, dedup, design-system (0003), UI concept (0004)
├── infra/          @evzla/infra — AWS CDK (Lambda/OpenNext, CloudFront, Cognito, S3, SES, purga)
└── supabase/
    ├── migrations/ SQL canónico de Postgres (extensiones, tablas, grants, RPC search_patient)
    └── functions/  `dedup` (worker fase 2, stub; heredado)
```

> **Nota:** `draft/` está gitignored (contiene el Excel real de pacientes, el prototipo de UI/UX
> `draft/design/concept-mvp1.html` y los runbooks de la migración a AWS). Por eso los logos viven en `assets/brand/` y el diseño se documenta
> en `specs/` (ambos versionados). La documentación de arquitectura versionada vive en
> `docs/ARCHITECTURE.md` (flujos, glosario y diagramas del sistema).

## Diseño (mobile-first)

La UI se diseña **primero para celular** (la familia busca en una emergencia desde el teléfono) y luego
se amplía a desktop. Identidad y guía de UX:

- **Tokens** (paleta + tipografía Inter + principios mobile-first): `specs/0003-design-system.md`.
- **Concepto de pantallas y flujos** (público: buscador / coincidencia / sin resultados — privado:
  login con código por correo / ingesta): `specs/0004-ui-concept.md`, destilado del prototipo de UI/UX.
- **Marca**: `assets/brand/` (logo SVG master + PNG).

> **Arquitectura: AWS (sa-east-1).** No hay backend propio aparte de Next.js:
>
> - **Cómputo:** Next.js empaquetado con **OpenNext** y servido desde **AWS Lambda**
>   (`build:aws`). `proxy.ts` (runtime Node) rechaza con 403 lo que no trae el header
>   `x-origin-verify` de CloudFront (`ORIGIN_VERIFY_SECRET`) y refresca la sesión del portal.
> - **Base de datos:** **RDS PostgreSQL** privada, TLS verify-full contra el CA del runtime de Lambda
>   (`NODE_EXTRA_CA_CERTS`). Un cliente por rol (`getDb('admin' | 'public' | 'job')`), una
>   conexión por Lambda, credenciales en **Secrets Manager** (`EVZLA_DB_SECRET_<ROL>`).
>   El público usa el rol `evzla_public`, que **solo** puede ejecutar los RPC mediados
>   `search_patient` y `list_solidarity_services`.
> - **Auth del portal `/admin`:** **Cognito** (user pool Essentials, sin contraseña, `EMAIL_OTP`
>   por el flujo `USER_AUTH`). Login en Server Actions; id/refresh token en cookies
>   httpOnly + secure, id token verificado con `aws-jwt-verify`. La autorización sigue siendo la
>   allow-list `team_members`. Invitar a un miembro lo da de alta en Cognito (`AdminCreateUser`,
>   sin mensaje de Cognito; la bienvenida va por Resend) y lo confirma con `AdminSetUserPassword`
>   (contraseña aleatoria permanente que no se guarda ni se usa).
> - **Subida de Excel:** el navegador sube directo a **S3** (`EVZLA_UPLOADS_BUCKET`) con URL
>   prefirmada (Lambda no acepta cuerpos > ~6 MB); la Server Action lee el objeto y lo borra.
> - **Secretos de la app** (Turnstile, salt, revalidate, OpenAI, Anthropic, Resend): del secreto
>   `EVZLA_APP_SECRET` en AWS; en dev local, de `process.env`.
> - **Logs:** sin PII. Los errores se loggean solo como `nombre:código` (`safeErrorTag`).

## NOTA de privacidad — los datos se tratan de forma segura

La privacidad de los pacientes es un **requisito innegociable** del diseño:

- **Separación física público / sensible.** Hay dos *schemas* de Postgres:
  `public` (no sensible) y `sensitive` (teléfonos, direcciones, observaciones clínicas).
  El rol público `evzla_public` **solo** puede ejecutar los RPC mediados; no tiene grants sobre
  tablas ni sobre `sensitive`, que jamás es accesible desde el cliente.
- **Búsqueda controlada.** El público nunca consulta tablas directamente. Solo existe la
  función `public.search_patient(term, client_hash)` (`SECURITY DEFINER`), que valida el término,
  hace el *matching* **por nombre o cédula** y devuelve
  `{ hospital_name, info_desk_phone, patient_name, confidence }` agrupado por hospital (ver
  [ADR-0002](adr/0002-apertura-de-nombres-adultos.md)). Para **menores** y **fallecidos** también se
  informa la ubicación ([ADR-0003](adr/0003-mostrar-ubicacion-todos-los-casos.md)); nunca teléfonos,
  direcciones, cédula ni notas.
- **Anti-enumeración.** Se registra solo el **hash** del término buscado (`search_log`, purgado a los
  90 días), nunca el texto en claro. Rate-limit por hash de IP en el RPC + Cloudflare Turnstile.
- **Logs sin PII.** Los errores se loggean como `nombre:código`; nunca términos, nombres ni filas.
- **Derecho al olvido.** El dato crudo se preserva en `raw_rows` para trazabilidad, y el
  modelo permite la baja/anonimización de una persona y sus contactos sensibles.

> PWA preparado pero **sin Service Worker activo** todavía.

## Estado y pendientes

**En producción en AWS** (`sa-east-1`) desde el **9 de octubre de 2026**, desplegado desde `main`;
Supabase y Vercel quedaron dados de baja ese día (ver [ADR-0010](adr/0010-migracion-supabase-vercel-a-aws.md)).
Calidad: typecheck 5/5 paquetes · **395 tests** (core 286 · db 20 · web 61 · infra 28) · `build` y
`build:aws` OK. Specs `0001`–`0025` · migraciones SQL `0001`–`0020` · ADRs `0001`–`0010`.

**Implementado:**
- **Buscador público** mobile-first: nombres agrupados por hospital (opción "abierta", consentida por la
  residente), también para menores/fallecidos (ADR-0003). Búsqueda multi-token y por trigramas, rate-limit
  + Turnstile. RPC `search_patient`.
- **Páginas públicas**: números de emergencia, directorio de **servicios solidarios** (publicación con
  moderación y enlace de gestión por token), sello "última actualización".
- **Diseño**: tokens oficiales (azul `#1565C0`, Inter), shadcn-style, banner de emergencia sticky.
- **Portal `/admin`**: auth **sin contraseña** (Cognito EMAIL_OTP) + roles (`uploader` / `hospital_admin` /
  `moderator`) por allow-list `team_members`; guard server-side; **audit log**; gestión de hospitales y
  equipo; métricas.
- **Ingesta**: Excel grande (subida directa a S3), dictado por voz, descarga de Excel por hospital,
  matching conservador y catálogo canónico de hospitales (ADR-0004/0005/0006).
- **Cola de revisión humana** (`/admin/review`) + **ejecución de la fusión** de pacientes.

**Pendiente:**
- **Base de datos:** versionar en el repo los roles `evzla_*`, sus grants y `purge_search_log()` (hoy
  solo en los scripts de la migración, `draft/aws-migration/`).
- **Opcional:** Service Worker PWA · extraer `@evzla/infrastructure` · undo de fusión · CSV en ingesta ·
  "Cargas recientes" persistida.
