# Runbook — Dominio `encuentramevzla.com` en producción

Cómo apuntar el dominio a Vercel y dejar el login (magic-link) funcionando en el dominio real.

> El runbook vive en `runbooks/` porque `docs/` está gitignored (contiene el Excel real de pacientes).

## Topología

- **Registrador:** Amazon Registrar (AWS) — solo registro del dominio.
- **DNS:** **Cloudflare** (nameservers `addyson.ns.cloudflare.com` / `oswald.ns.cloudflare.com`).
  Los registros se crean en Cloudflare, **no** en Route 53.
- **Hosting/app:** Vercel.
- **Auth/DB:** Supabase.

## Decisiones

- Dominio principal: **apex** `encuentramevzla.com`. `www` redirige al apex (308).
- Registros DNS en **DNS only (nube gris)**: Cloudflare solo resuelve; **Vercel emite el SSL**
  (Let's Encrypt) y sirve el CDN. Evita bucles de redirección y doble CDN.

## El repo NO necesita cambios

El código deriva el dominio en runtime, así que funciona en cualquier host:

- `apps/web/app/admin/login/page.tsx` → `emailRedirectTo: \`${window.location.origin}/auth/callback\``
- `apps/web/app/auth/callback/route.ts` → usa el `origin` del request.

No hay que tocar `.env` ni variables de entorno en Vercel para el dominio.

## Pasos

### 1. Vercel (Settings → Domains)
1. Add Domain → `encuentramevzla.com` → marcar **Primary**.
2. Add Domain → `www.encuentramevzla.com` → aceptar **redirect 308 al apex**.
3. Vercel muestra los registros DNS requeridos (apex `A` + `www` `CNAME`). Copiar **los que muestre**.

### 2. Cloudflare (DNS → Records) — todos en **DNS only (gris)**
| Tipo | Nombre | Valor | Proxy |
|---|---|---|---|
| A | `@` | *(IP que indique Vercel)* | DNS only |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only |

Borrar cualquier A/AAAA/CNAME viejo en `@` o `www` que choque.

### 3. Esperar verificación
Cloudflare propaga en minutos. Vercel pasa a "Valid Configuration" y emite el certificado SSL solo.

### 4. Supabase (Authentication → URL Configuration)
- **Site URL:** `https://encuentramevzla.com`
- **Redirect URLs** (dejar también la de dev):
  - `https://encuentramevzla.com/auth/callback`
  - `https://www.encuentramevzla.com/auth/callback`
  - `http://localhost:3000/**`

> Esto es también el pendiente "Redirect URL del dominio en Supabase" sin el cual el
> magic-link no funciona en el deploy.

## Verificación (CLI)

```bash
dig +short A encuentramevzla.com                 # debe resolver a IPs de Vercel
dig +short www.encuentramevzla.com               # CNAME → *.vercel-dns.com
curl -sS -I https://encuentramevzla.com          # HTTP/2 200 · server: Vercel · HSTS
curl -sS -I https://www.encuentramevzla.com      # HTTP/2 308 · location: https://encuentramevzla.com/
```

Prueba end-to-end: pedir magic-link en `https://encuentramevzla.com/admin/login` y confirmar
que el enlace del correo aterriza en `/auth/callback` y abre el portal.

## Estado (2026-06-26)

- ✅ DNS apex + `www` apuntando a Vercel (Cloudflare, DNS only).
- ✅ Apex responde `200` con SSL válido (HSTS) y sirve la app.
- ✅ `www` → `308` al apex.
- ⏳ Supabase URL Configuration (paso 4) — pendiente de aplicar en el panel.
