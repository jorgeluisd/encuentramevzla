# 0029 · R3 (Function URL del server en AWS_IAM + OAC SIGV4_ALWAYS): revisión de seguridad y código

Diff: `develop...HEAD` (rama `feat/0029-r3-server-iam`, 03cb307 + docs). Código: `infra/lib/open-next-site.ts:149-161`, `infra/test/evzla-stack.test.ts:318,409-412`. Sin AWS ni commits. Evidencia propia: synth local con el fixture (`tsx` sobre `buildApp` en el scratchpad). Salen 4 `AWS::Lambda::Permission`, todos con principal `cloudfront.amazonaws.com` y `SourceArn` a `SiteDistribution`. No hay ningún `"Principal":"*"` en toda la plantilla. Las 2 URL están en `AWS_IAM` y los 2 OAC lambda en `always`.

RESUMEN: 7 hallazgos (crítico 0 / alto 1 condicional / medio 2 / bajo 4) · riesgo residual: **requiere decisión** (A1 se puede comprobar hoy contra imágenes, antes del merge)

## Caminos con body hacia el server (¿alguno se salta el interceptor?)

| Camino | Resultado | Evidencia |
|---|---|---|
| `<form action>` / `formAction` (15) | Pasan por `HydratedSubmit`; la guarda AST sigue verde | 06-code-review T-9b; grep de `action=`/`formAction` en app/ y components/ |
| Formularios `onSubmit` (login, equipo, hospitales, cargar, ingesta, search-box) | Antes de hidratar hacen un **GET** nativo (no llevan `method`), que OAC firma sin hash. Después llaman Server Actions con `fetch` | `app/admin/login/page.tsx:79,133`; `equipo-client.tsx:131` |
| Server Actions | Next llama al `fetch` global **en cada llamada** (`segment-cache/fetch.js` → `fetch(input, init)`), así que pasan por el interceptor. El replay offline también vuelve a pasar | `next/dist/client/components/router-reducer/reducers/server-action-reducer.js:75` |
| `sendBeacon` / XHR / EventSource / WebSocket | Ninguno en la app ni en `next/dist/client` | grep |
| Excel | PUT prefirmado a S3 (otro origen, el interceptor no lo toca) y luego una acción pequeña con `objectKey` | `lib/upload/stage-excel-upload.ts:14`, `lib/actions/ingesta.ts:55` |
| Dictado | Server Action multipart con `Blob` (C1 S4 cubre binario) | `cargar-client.tsx:209-211` |
| Turnstile / Cognito | Turnstile se verifica en el server hacia Cloudflare. Cognito EMAIL_OTP va por Server Actions. No hay callbacks entrantes | `cloudflare-turnstile-verifier.ts:19`, `lib/actions/auth` |
| Rutas `/api/*` | Solo `/api/revalidate` (POST, llamador externo) y `admin/(protected)/export` (GET) | `find app -name route.ts` |
| ISR de OpenNext | HEAD a `https://${x-forwarded-host}${url}`, o sea, a CloudFront, que firma. Sin body | `@opennextjs/aws` `core/requestHandler.js:31-32`, `adapters/revalidate.js:23` |

## Firma en el behavior del server

- `Host` no se reenvía (`ALL_VIEWER_EXCEPT_HOST_HEADER`, T6) y CloudFront firma con el host de la URL. `forwardHost` (`open-next-site.ts:176`) **sobrescribe** el `x-forwarded-host` del cliente, así que no se puede suplantar. `x-origin-verify` es un custom header del origen y se agrega antes de firmar. Es el mismo patrón que blockealo (`nextjs-site.ts:85-131`).
- Métodos `ALLOW_ALL` (`:211`). `x-amz-content-sha256` queda fuera de la cache policy (T5).
- Tamaño de body: Lambda URL acepta como máximo 6 MB de request en cualquiera de los dos modos. OAC no agrega otro límite documentado. Ya existía antes: `bodySizeLimit: "8mb"` (`next.config.ts:14`) es mayor que lo que acepta Lambda.

## Hallazgos

| Sev | Hallazgo | Archivo:línea | Escenario de falla | Recomendación / test que falta |
|---|---|---|---|---|
| **Alto (condicional, hipótesis no verificada)** | Posible envenenamiento de caché con un 403. El `x-amz-content-sha256` que manda el viewer entra en la firma, y ninguna función lo quita en GET/HEAD. Un 403 de origen en GET se cachea 10 s por defecto (ErrorCachingMinTTL), y la distribución no tiene `errorResponses`. El header no forma parte de la clave de caché. | `open-next-site.ts:173-178` (función solo copia host), `:181-198`, `:247-257` | Un atacante pide `GET /` con `accept` de navegador, sin cookies y con un hash falso. Lambda responde 403 y CloudFront lo sirve a **todos los visitantes anónimos del home** durante 10 s. Repetirlo cada 10 s es un DoS barato del buscador. Desde R2 ya puede pasar lo mismo con cada `/_next/image` (impacto menor). R3 lo extiende al server. | Comprobarlo **antes del merge** con V-0. Si se confirma, bloquea R3: hay que quitar el header en viewer-request para métodos sin body (server e imagen) y/o poner `ErrorCachingMinTTL` 0 para 403. Tests que faltan: unit del código de la CloudFront Function (como `blockealo/infra/aws/test/edge-functions.spec.ts`) y un test de plantilla sobre el TTL de error. |
| Medio | La primera validación real de SigV4 para **POST con cookies, `x-origin-verify`, `x-forwarded-host` modificado y query strings** ocurre en producción. C1 solo compara el hash (el proxy no verifica SigV4). R2 solo validó GET sin custom header, sin función y sin cookies. El smoke de CI solo hace GET. | `open-next-site.ts:152,160`; `infra/scripts/ci/smoke.mjs` | Si falla, todos los POST dan 403 (buscador, servicios, admin) y nadie se entera: no hay telemetría y CloudFront no tiene logs. | Correr V-3..V-6 justo después del deploy. Las sondas a `/api/revalidate` no necesitan token: 401 = la firma pasó, 403 = falló. Test que falta: agregar la sonda POST (hash correcto → 401, sin hash → 403) a `smoke.mjs`. |
| Medio | No hay evidencia registrada de C2 (AC-M7 + imagen no cacheada 200 tras R2), y el plan dice que bloquea R3. | `gates.md` (sección R2), `06-verify-r2.md:30`, `04-plan.md:59` | Se aprueba R3 sin haber confirmado los permisos de CloudFront en el server real. | Registrar el resultado de C2 en `gates.md` antes de aprobar (V-1, solo lectura). |
| Bajo | T4 solo mira los permisos cuyo `FunctionName` referencia la función o su URL. Si en el futuro aparece un `*` sobre una alias/version u otra función, no lo detecta. Que no pase en vacío depende de T3. | `evzla-stack.test.ts:361-366,409-412` | Regresión silenciosa de permisos. | Agregar una aserción de plantilla completa: ningún `AWS::Lambda::Permission` con `Principal: "*"`. Hoy el synth da 0. |
| Bajo | Ventana de propagación: los edges con el OAC todavía en `no-override` dejan pasar un `Authorization` del viewer sin firmar, lo que da 403. Si es un GET, se cachea 10 s. | `open-next-site.ts:160` | 403 puntuales durante minutos. Es el mismo caso que se aceptó en R2. | Aceptar. V-3 se repite a los 15 min. |
| Bajo | El dictado no tiene tope de duración: a 64 kbps, unos 12 min superan los 6 MB de Lambda. Ya pasaba antes de R3, que no lo cambia. | `cargar-client.tsx:173-185`, `lib/actions/voz.ts:80` | El dictado falla sin un mensaje claro. | Backlog: limitar la duración en el cliente. |
| Bajo | Docs: `03-design.md:76` todavía describe el T4 anterior ("sí y solo si NONE"). El comentario de `open-next-site.ts:149-150` dice que el hash lo calcula "el navegador", pero los llamadores externos de `/api/revalidate` también lo envían. | `03-design.md:76`; `open-next-site.ts:150` | Confusión al operar. | Archiver: actualizar el diseño y ratificar ADR-0012 (sigue en PROPUESTO). |

## REFACTOR de T4 (`toHaveLength(0)`)

Correcto y mejor que antes. La versión anterior (`length > 0 === authType === "NONE"`) era una tautología respecto de `EXPECTED`, y con ambos literales en `AWS_IAM` ya no compilaba (TS2367). Ahora afirma AC-22 directamente. Eso además resuelve el bajo 4 de `06-security-review.md`: ya no hace falta validar la *forma* de los `*`, porque no debe haber ninguno. La aserción es estricta y no depende de la tabla. Se verificó en RED (`expected true to be false` con el código de R2). Límite: el alcance es por función (ver el bajo de T4). El parámetro `_name` sin usar está bien.

## AMENAZAS DEL DISEÑO (alcance R3)

| Amenaza | Implementada | Test |
|---|---|---|
| Invocación directa de la URL del server | Sí (`AWS_IAM`, sin `*`) | T1, T4. AC-M1 queda manual (V-2) |
| Confused deputy | Sí (`SourceArn` a la distribución en los 4 permisos) | T3 |
| Disponibilidad de POST sin hidratar | Sí (`HydratedSubmit`; los `onSubmit` hacen GET) | AC-10..13, C1 |
| Upload a S3 | Sí (otro origen) | AC-5, C1 S5 |
| Token de revalidación / `Authorization` | Sí (ALWAYS sobrescribe; token en `x-revalidate-token`) | AC-16/17, T5 |
| `x-origin-verify` como segunda capa | Sí (solo en el origen server) | L301 |
| **Nueva:** 403 cacheado por hash falso del viewer | **No** | **No** (A1) |

## RIESGO RESIDUAL

1. A1 sin verificar. Si V-0 da 403 cacheado, es inaceptable hasta mitigarlo. Si CloudFront ignora el hash del viewer en GET o no cachea el 403, se cierra.
2. La firma de POST contra IAM real solo se valida después del deploy. Es aceptable con V-3..V-6 y la reversión preparada (C4), porque el sitio no está en uso.
3. Los llamadores externos de `/api/revalidate` que no conocemos (C5) recibirán 403. El impacto se limita al sello "Actualizado" (aceptado en GATE 1).
4. Ya existía antes: antes de hidratar, el formulario de invitación de `equipo` hace un GET nativo con `email` en la URL (`equipo-client.tsx:131-132`) y queda en el historial del navegador. No depende de R3. Va al backlog.
5. Condición vigente de GATE 2/R1: no activar logs de CloudFront ni logs de headers. Con ellos, el hash se convierte en un derivado del término buscado.

## Verificaciones (solo datos sintéticos; no pegar hashes, tokens ni ARNs en tickets)

- **V-0 (antes del merge, contra imágenes, que ya están en IAM).** Elegir un asset real de `_next/static/media` y un UUID nuevo `U`:
  1. `curl -s -o /dev/null -w '%{http_code}\n' -H 'accept: image/avif,image/webp,*/*' -H 'x-amz-content-sha256: 0000000000000000000000000000000000000000000000000000000000000000' 'https://encuentramevzla.com/_next/image?url=<asset>&w=16&q=75&p=U'`
  2. Antes de 10 s, la misma URL **sin** ese header, con `-D -`. Si responde 403 con `x-cache: Error from cloudfront` o `Hit`, A1 queda confirmado y se mitiga antes de R3.
- **V-1 (C2, antes de aprobar).** `aws lambda get-policy` del server y de la imagen (solo lectura). Esperado: exactamente 2 statements por función, ambos de `cloudfront.amazonaws.com` con `AWS:SourceArn` de la distribución, y ningún `*`. Registrarlo en `gates.md`.
- **V-2 (AC-M1/AC-M6).** `aws lambda get-function-url-config` → `AuthType: AWS_IAM` en ambas. `curl` GET y `curl -X POST` directos a la URL del server: los dos dan 403.
- **V-3 (GET firmado).** Por dominio, deben responder 200: `/`, `/servicios`, `/admin/login`, `/admin/login?q=%C3%91and%C3%BA%20P%C3%A9rez&x=a+b&e=&k=1&k=2`. Una ruta inexistente debe dar 404. El smoke de CI también tiene que pasar. Repetir a los 15 min.
- **V-4 (POST firmado sin token, discrimina IAM de app).** `E=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`:
  - `curl -s -w '%{http_code}' -X POST -H "x-amz-content-sha256: $E" https://encuentramevzla.com/api/revalidate` → **401** `{"code":"unauthorized"}`. Lo mismo sin el header → **403**.
  - Con `--data-binary x` y `x-amz-content-sha256` = `printf x | shasum -a 256` → 401. Con un hash incorrecto → 403.
  - El caso con hash correcto, repetido con `?a=b+c%20d` y con `-H 'cookie: a=b'` → 401.
- **V-5 (body grande).** `head -c 5000000 /dev/urandom > <scratch>/b`, con su hash → 401 (no 403 ni 413).
- **V-6 (navegador, AC-M4).** Hacer cada operación con datos sintéticos:
  - Buscar `Persona Prueba`.
  - Reportar o enviar un servicio y luego moderarlo.
  - Login OTP completo y logout.
  - Una acción de `review`/`foreign-rows`.
  - En `/admin/cargar?q=Prueba`, guardar un paciente sintético (POST a una URL con query) y borrarlo.
  - Subir la plantilla Excel sintética.
  - Un dictado corto.

  En todas, la consola no debe mostrar 403.
- **V-7 (AC-M5 + ISR).** `POST /api/revalidate` con `x-revalidate-token` y `$E` → 200, y el sello se refresca. En CloudWatch de `RevalidationFunction` no debe aparecer `Failed to revalidate`.
- **V-8 (primera hora).** En la métrica `4xxErrorRate` de la distribución (no requiere logs), no debe haber un salto respecto al día anterior. Si aparece y V-4 falla, se revierte con `ref` = SHA de R2. Si eso no alcanza, la emergencia por CLI de `03-design.md:129-133` y luego la reconciliación (AC-M6).
