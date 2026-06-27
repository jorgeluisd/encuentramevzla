# Spec 0016 — Anti-abuso del buscador: rate-limit + Cloudflare Turnstile

Estado: **propuesto** (pendiente Gate 1) · Capacidad: `patient-search` · Ver `privacy-and-security.md` (regla 4, anti-enumeración).
Relacionado: spec 0015 / ADR-0003 (al exponer la ubicación en todos los casos, el anti-abuso pasa de "recomendado" a **requisito**).

## 1. Motivación

Tras retirar el gate de menores/fallecidos (0015), el buscador revela la ubicación de **toda** persona
coincidente. Esto habilita un abuso concreto: la **enumeración** — un script que prueba miles de
nombres/cédulas en automático y se descarga el mapa completo "quién está en qué hospital", justo lo que
la privacidad mediada quería evitar.

Se añaden **dos defensas complementarias**:

1. **Cloudflare Turnstile** (prueba de humanidad): un script no genera tokens válidos → ni llega al RPC.
2. **Rate-limit** (límite de frecuencia por fuente): un humano busca a 3-4 personas; un enumerador
   necesita miles de peticiones → se le estrangula antes de poder vaciar la base.

## 2. Decisiones (Gate 1, aprobadas por el dueño)

- **Rate-limit:** contador en **Postgres** dentro del RPC, por **hash de IP** (sin infra nueva, solo
  hashes — coherente con `search_log`). Se descartó Redis propio (Forge no expuesto / riesgo) y
  Cloudflare WAF (gestión fuera del código).
- **Turnstile:** verificación **obligatoria en toda búsqueda** vía **Server Action**. Se **retira** la
  navegación GET compartible `/buscar?termino=…` (era el agujero de enumeración); los resultados se
  renderizan desde la acción. `/buscar` se conserva como ruta que **redirige a `/`** (compat de enlaces).
- **Umbrales (tunables):** **30 búsquedas / 10 min por IP**. Al exceder → resultado `rate-limited`.

## 3. Diseño por capas (Onion)

### 3.1 Dominio / Aplicación (`@evzla/core`, puro)

- `MediatedSearchResult` gana una variante: `| { kind: "rate-limited" }`.
- `PatientSearchGateway.search(term, clientId?: string)`: se añade un identificador de cliente opcional
  (el hash de IP) que el adapter reenvía al RPC. `SearchPatients.execute(rawTerm, clientId?)` lo propaga.
- **Nuevo port** `HumanVerificationGateway { verify(token: string, remoteIp?: string): Promise<boolean> }`.
- **Nuevo caso de uso** `VerifyHumanChallenge` (envuelve el port; testeable con un fake) — devuelve
  `true/false`. Mantiene la presentación sin tocar infraestructura directamente.

### 3.2 Infraestructura (`apps/web`, adapters)

- `CloudflareTurnstileVerifier implements HumanVerificationGateway`: POST a
  `https://challenges.cloudflare.com/turnstile/v0/siteverify` con `TURNSTILE_SECRET_KEY` + token (+ IP).
- `SupabasePatientSearchGateway.search(term, clientId)`: pasa `client_hash` al RPC y mapea
  `{ rate_limited: true }` → `{ kind: "rate-limited" }`.

### 3.3 SQL / RPC (migración 0007)

- `ALTER TABLE public.search_log ADD COLUMN client_hash text;` + índice `(client_hash, created_at)`.
  `client_hash` es nullable (compat) y **es un hash** (no PII): `sha256(ip + RATE_LIMIT_IP_SALT)`.
- `CREATE OR REPLACE FUNCTION public.search_patient(term text, client_hash text DEFAULT NULL)`:
  - Si `client_hash` no es NULL: cuenta filas de `search_log` con ese `client_hash` en la ventana
    (10 min). Si `>= 30` → inserta fila `result_type = 'rate_limited'` y devuelve
    `{ rate_limited: true }` (sin ejecutar la consulta cara).
  - Si pasa el límite: ejecuta el matching de 0006 igual que hoy; cada llamada inserta su fila en
    `search_log` (con `client_hash`), que **es** el contador.
  - `result_type` admite ahora: `invalid_term | matches | no_results | rate_limited`.
  - Se mantiene: `SECURITY DEFINER`, `search_path` fijo, hash del término, matching AND por token.

### 3.4 Presentación (`apps/web`)

- `SearchForm` (client): añade el **widget Turnstile** (script oficial de Cloudflare, sin paquete npm;
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). El submit pasa a `useActionState(searchAction)`; los resultados
  se renderizan **en la misma página** (home), debajo del formulario.
- **Server Action** `searchAction` (`apps/web/lib/actions/search.ts`, `"use server"`):
  1. Lee la IP del cliente de las cabeceras (`x-forwarded-for`) y calcula `client_hash`.
  2. Verifica el token Turnstile (`VerifyHumanChallenge`). Si falla → estado `verification-failed`.
  3. `SearchPatients.execute(term, client_hash)`. Devuelve un estado serializable para `useActionState`.
- `/buscar/page.tsx` → `redirect("/")` (la búsqueda ya no vive en la URL). UI de resultados (grupos por
  hospital, sin-resultados, invalid-term) **se mueve** al componente de resultados de la home + se añade
  el estado `rate-limited` ("Demasiadas búsquedas, intenta en unos minutos").

## 4. Config / secretos (los crea el dueño)

| Variable | Dónde | Qué es |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile (nuevo widget) | clave pública del widget |
| `TURNSTILE_SECRET_KEY` | idem (servidor) | clave secreta de verificación |
| `RATE_LIMIT_IP_SALT` | secreto propio (Vercel env) | sal para hashear la IP (no reversible) |

Constantes tunables (umbral/ventana) en el RPC: `30` / `10 min`. Documentadas para ajuste posterior.

## 5. Privacidad (qué se mantiene / refuerza)

- `search_log` sigue guardando **solo hashes** (término + ahora IP). Ninguna IP en claro.
- El público sigue accediendo solo vía `search_patient` (`SECURITY DEFINER`); ningún grant nuevo a `anon`.
- Separación `public`/`sensitive` intacta. El anti-abuso **refuerza** la regla 4 (anti-enumeración).

## 6. Plan TDD / verificación

- **Core (Vitest, test primero):** `VerifyHumanChallenge` (fake verifier ok/falla); `SearchPatients`
  propaga `clientId`; mapeo de `rate-limited` en el gateway (fake RPC).
- **RPC (Vitest no alcanza SQL):** harness node en `packages/db` con **transacción + ROLLBACK** contra
  prod (con OK explícito): 31 llamadas con el mismo `client_hash` → las primeras 30 buscan, la 31 devuelve
  `rate_limited`; `client_hash` distinto no se ve afectado.
- **Verifier (infra):** test del adapter Turnstile con `fetch` mockeado (token válido/ inválido).
- `pnpm typecheck` 4/4 · `pnpm test` verde · `pnpm build` OK.

## 7. Fuera de alcance

- Bloqueo persistente / baneo de IPs reincidentes (hoy solo ventana deslizante).
- Rate-limit en el borde (Cloudflare WAF) — se podrá añadir como capa extra sin tocar este diseño.
- Dashboard de métricas de abuso (vive en el pendiente #5, usa `search_log`).
</content>
</invoke>
