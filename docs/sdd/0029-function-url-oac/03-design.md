# 0029 function-url-oac: design

RESUMEN
- Interceptor puro en `apps/web/lib/origin-signing/content-hash-fetch.ts`, instalado desde `apps/web/instrumentation-client.ts`, que Next 16.4.2 carga antes de hidratar (`app-next.js`). Normaliza el body con `new Request(...)` y hashea los mismos bytes que envía.
- Control de envío: componente `HydratedSubmit` (sobre `Button`) + hook `useHydrated` en `lib/`; una guarda AST en Vitest lo exige en los 15 formularios.
- CDK: cada release cambia solo literales en `open-next-site.ts` (authType y `signing` de cada OAC) y la constante `EXPECTED` del test. Sin flags, contexto ni ramas.
- El permiso `InvokeFunctionUrl` que crea CDK 2.272.0 con OAC no lleva `FunctionUrlAuthType` y es idéntico en R1..R3, así que no se reemplaza en el corte (AC-20).
- Desde R3, los llamadores de `/api/revalidate` envían `x-amz-content-sha256` del body vacío (`e3b0…b855`); si no, la firma falla (AC-M5).
- C1: fixture Next mínimo en `apps/web/e2e/content-hash/` (mismo `next`, mismo `instrumentation-client`) frente a un proxy verificador local, con Playwright en chromium, webkit y firefox. No toca AWS.
- Sin cambios en core, db, `proxy.ts`, `x-origin-verify`, esquema ni datos. R3 no se despliega sin OK explícito del humano.

PIEZAS POR CAPA (ruta · responsabilidad · imports)
- `apps/web/lib/origin-signing/content-hash-fetch.ts` · crea e instala el wrapper de `fetch` · no importa nada (solo Web APIs: `Request`, `Headers`, `URL`, `SubtleCrypto`).
- `…/content-hash-fetch.test.ts` · AC-1..AC-8 · `vitest`, `node:crypto` (oráculo), `node:fs` (escaneo estático AC-8).
- `…/use-hydrated.ts` · `useSyncExternalStore(noopSubscribe, () => true, () => false)` · `react`. Su test (`use-hydrated.test.ts`) verifica que el SSR da `false` (AC-10) con `react-dom/server` y `createElement`, sin JSX.
- `…/hydrated-submit-guard.test.ts` · guarda estática AC-13/AC-14 · `typescript` (AST), `node:fs`, `node:path`.
- `apps/web/instrumentation-client.ts` · composition root del cliente: `installContentHashFetch(window)` · `@/lib/origin-signing/content-hash-fetch`.
- `apps/web/components/ui/hydrated-submit.tsx` (`"use client"`) · `<Button type="submit">` con `disabled = !hydrated || props.disabled`; deja pasar `formAction`, `name`, `value`, `variant`, `title` · `./button`, `@/lib/origin-signing/use-hydrated`.
- `apps/web/components/ui/js-required-notice.tsx` · `<noscript>` en español; sirve en server y en client · `react`.
- Formularios (9 archivos, 15 formularios): `search-panel`, `submit-service-form`, `report-service-button`, `manage-service-form` ×2, `services-admin-browser` ×5, `(protected)/layout` ×2, `review-case-actions` ×2 ("Fusionar" sigue `type="button"`), `foreign-row-actions` (`SubmitButton` envuelve `HydratedSubmit` con `formAction` y `disabled={pending}`). Los 5 públicos agregan `<JsRequiredNotice/>` dentro del `<form>`.
- `apps/web/lib/revalidation/revalidate-request.ts` · `handleRevalidate(request, { token, revalidate }): Promise<Response>`, que lee solo `x-revalidate-token` · no importa nada. Su test cubre AC-15..AC-18.
- `apps/web/app/api/revalidate/route.ts` · compone `appSecret("REVALIDATE_TOKEN")` y `revalidatePath("/")` · `next/cache`, `@/lib/infrastructure/app-secrets`, `@/lib/revalidation/revalidate-request`.
- `apps/web/e2e/content-hash/{run.mjs, fixture/**}` · harness C1 · `playwright` (devDep nueva, versión exacta), `node:http`, `node:crypto`, `node:child_process`. Además, en `apps/web/{tsconfig.json, eslint.config.mjs}` y `.gitignore`: excluir `e2e/**` del tsc de la app e ignorar `e2e/**/.next/**` en lint y en git.
- `infra/lib/open-next-site.ts` · URLs, OAC, permisos y comentario L147 · agrega `aws-cdk-lib/aws-iam`. `infra/test/evzla-stack.test.ts` · nuevo `describe("function URL access (ADR-0012)")`; L120 y L301 sin cambios.
- Onion: `lib/origin-signing` y `lib/revalidation` no importan `app/` ni `components/`; `components/ui` importa `lib/`. Coincide con la zona actual del lint.

DOMINIO · APLICACIÓN
- No aplica: `@evzla/core` no cambia; no hay aggregates, VOs, ports ni casos de uso nuevos, así que no hace falta ADR adicional.
- Invariantes con nombre:
  - INV-HASH-PER-CALL: cada llamada serializa una vez y hashea esos bytes; sin estado de módulo.
  - INV-SAME-ORIGIN-ONLY: solo se tocan peticiones del mismo origen.
  - INV-NO-TRACE: nada de body, hash ni término en consola, storage o red adicional.
  - INV-SUBMIT-AFTER-HYDRATION: todo submit de `<form action>` o con `formAction` pasa por `HydratedSubmit`.
- Por construcción: el `catch` sin binding hace imposible loggear el error. En runtime y con la guarda AST: selección de peticiones, hash y control de envío.

BORDE
- `createContentHashFetch({ fetch, origin, subtle })`; `installContentHashFetch(win)` le pasa `win.fetch.bind(win)`, `win.location.origin` y `win.crypto?.subtle`. Pasos:
  1. `method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()`. Si no es POST, PUT, PATCH o DELETE, `fetch(input, init)` sin leer el body (AC-4).
  2. `url = new URL(input instanceof Request ? input.url : String(input), origin)`. Si `url.origin !== origin`, sale idéntica, sin header (AC-5; cubre el PUT presignado a S3). Una URL relativa o absoluta al mismo host es same-origin; un subdominio no.
  3. Sin `subtle`, sale sin header (AC-7).
  4. En el `try`: `source = new Request(input instanceof Request ? input.clone() : url, init)`. El constructor serializa el FormData una sola vez y deja el `Content-Type` con boundary en `source.headers`; un string queda `text/plain;charset=UTF-8`, como lo pondría el navegador. Luego: `bytes = await source.clone().arrayBuffer()`, `hex` = SHA-256 en minúsculas, `headers = new Headers(source.headers)` + `x-amz-content-sha256`, y `prepared = new Request(source, { headers, body: bytes })`. Así se envían esos mismos bytes con el mismo `Content-Type` (AC-1/2/3: body nulo = 0 bytes = `e3b0…`).
  5. `fetch(prepared)` va fuera del `try`: un error de red se propaga tal cual, sin reintentar ni duplicar la acción.
- Si el cálculo falla (cualquier excepción del paso 4): `catch {}` y `fetch(input, init)` con los argumentos originales, que siguen intactos (Request clonado, FormData no consumido). Antes de R3 funciona; tras R3 da un 403 sin header visible en devtools. No se registra nada. Con un `ReadableStream` como body, el fallback rechaza como cualquier fetch; la app no usa streams.
- AC-8: test estático sobre el fuente (sin `console.`, `localStorage`, `sessionStorage`, `indexedDB`, `sendBeacon`, `XMLHttpRequest` ni `catch (`) y espía de `console.*` en el unit.
- AC-6: dos llamadas con el mismo FormData dan dos boundaries y dos hashes, cada uno igual al SHA-256 de su body; las concurrentes no se mezclan.
- `/api/revalidate` (sin 400, no lee el body, no loggea):
  - 200 `{ ok: true, revalidated: "/" }`.
  - 401 `{ ok: false, code: "unauthorized" }` si `x-revalidate-token` falta o no coincide; `Authorization` se ignora siempre (AC-17).
  - 503 `{ ok: false, code: "not_configured" }`.
- Guarda AC-13 (AST de `typescript` sobre los `.tsx` de `app/` y `components/`; falla con `archivo:línea:col`):
  - (a) un `<form>` con `action` sin `HydratedSubmit` en su subárbol;
  - (b) un `formAction` en un elemento que no es `HydratedSubmit`;
  - (c) un `button`/`Button` dentro de un `<form action>` cuyo `type` no es el literal `"button"` (sin `type` cuenta como submit).
  - Incluye casos negativos inline y exige al menos 15 formularios detectados, para no pasar en vacío.
  - AC-14: los 4 archivos públicos llevan `JsRequiredNotice` dentro de cada `<form action>`.
- AC-10/11/12: el SSR `disabled` lo prueban el unit del hook y la guarda; la habilitación tras hidratar y el Enter sin envío, el harness C1.

INFRAESTRUCTURA (CDK, `open-next-site.ts`)
- `serverUrl`/`imageUrl`: `addFunctionUrl` con `authType` literal (R1 NONE/NONE · R2 NONE/AWS_IAM · R3 AWS_IAM/AWS_IAM). Mismos logical IDs; actualización en sitio.
- Orígenes:
  - Server: `origins.FunctionUrlOrigin.withOriginAccessControl(serverUrl, { customHeaders: { "x-origin-verify": … }, originAccessControl: new cloudfront.FunctionUrlOriginAccessControl(this, "ServerOac", { signing: cloudfront.Signing.SIGV4_NO_OVERRIDE }) })`.
  - Imagen: igual con `"ImageOac"`, sin header.
  - El OAC se crea en el sitio porque `validateAuthType` lo lee de `node.children` y rechaza ALWAYS + NONE en synth.
  - R2 pasa `ImageOac` a `SIGV4_ALWAYS` y R3 `ServerOac`; ambos se actualizan en sitio.
- Permisos:
  - `bind` crea `InvokeFromApiFor<originId>`: `lambda:InvokeFunctionUrl`, principal `cloudfront.amazonaws.com`, `SourceArn` = distribución, sin `FunctionUrlAuthType` (AC-20).
  - A mano, tras `this.distribution`, en server e imagen: `fn.addPermission("CloudFrontInvokeViaUrl", { action: "lambda:InvokeFunction", principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"), sourceArn: this.distribution.distributionArn, invokedViaFunctionUrl: true })`. Lleva comentario: CDK no lo agrega (aws-cdk#35872), como en el referente blockealo.
  - Con NONE, CDK agrega `invoke-function-url` e `invoke-function` con `*`; al pasar a AWS_IAM desaparecen (AC-22).
  - No hay ciclos: permiso → distribución → URL → función.
- `x-origin-verify`: `withOriginAccessControl` pasa `customHeaders` a `OriginBase` y el `DomainName` sigue referenciando la URL "ServerFunction…". L301 debería sobrevivir; lo confirma su primera corrida (no hice synth).
- Comentario L147: en R1 dice que hay OAC NO_OVERRIDE sobre URLs NONE durante la secuencia de ADR-0012; en R3, que solo CloudFront (OAC) invoca las URL y que los POST llevan `x-amz-content-sha256` calculado en el navegador (AC-25).
- Tests de infra (`EXPECTED = { server: { authType, signing }, image: { authType, signing } }` es la única línea del test que cambia por release):
  - T1: `AWS::Lambda::Url` por función, identificada por `TargetFunctionArn`.
  - T2: AC-19. Origen → `OriginAccessControlId` → OAC; filtrando por tipo `lambda` quedan exactamente 2 (de los 3 de la plantilla; el de S3 queda fuera), sigv4, con `signing` según `EXPECTED`.
  - T3: AC-20. Por función, `InvokeFunctionUrl` (sin `FunctionUrlAuthType`) e `InvokeFunction` + `InvokedViaFunctionUrl`, ambos con principal cloudfront y `SourceArn` que referencia la Distribution, sin `*`.
  - T4: desde R3, ninguna de las dos funciones tiene permisos con principal `*` (`toHaveLength(0)` por función, AC-22). T4b: ninguna `AWS::Lambda::Permission` de toda la plantilla tiene principal `*`.
  - T5: `ServerCachePolicy` sin `x-revalidate-token` ni `x-amz-content-sha256`; Distribution sin `Logging`.
  - T6: los behaviors default e imagen siguen con `ALL_VIEWER_EXCEPT_HOST_HEADER` (AC-24).

DATOS + PLAN DE MIGRACIÓN
- Sin DDL, backfill ni contract: no se toca BD, roles, RLS ni `sensitive`. Sin riesgo de lock.
- El expand/contract es de infraestructura: R1 (firma y permisos sobre NONE) → R2 (imagen IAM) → R3 (server IAM). Reversión en orden inverso.

EVENTOS Y JOBS
- Ninguno nuevo ni modificado. El ISR de OpenNext hace HEAD por CloudFront, que lo firma; no necesita hash.

COMPOSITION ROOT
- Cliente: `instrumentation-client.ts` es el único punto de instalación del interceptor. Servidor: `route.ts` inyecta `token` y `revalidate` en `handleRevalidate`; `lib/composition.ts` no cambia. Tokens `Symbol`: no aplica (no hay contenedor DI). Infra: OAC y permisos viven en `OpenNextSite`.

PRUEBA C1 (harness local; bloquea R3; no corre en `pnpm test`)
- Comando: `pnpm --filter @evzla/web test:content-hash` → `node e2e/content-hash/run.mjs`. Navegadores, una sola vez: `pnpm --filter @evzla/web exec playwright install chromium webkit firefox`.
- Fixture en `e2e/content-hash/fixture/`:
  - Su `instrumentation-client.ts` reexporta el de la app; su `tsconfig` mapea `@/*` a `apps/web`; `next.config.ts` fija `turbopack.root` en la raíz del repo.
  - Una página con: acción con argumento string (`text/plain`); `<form action>` con `Ñandú Pérez`, emoji y un archivo binario, cuya acción devuelve el tamaño recibido; `fetch` PUT al segundo origen; dos acciones concurrentes. Todos los botones son `HydratedSubmit`.
- `run.mjs` hace `next build` real y `next start` en el puerto A, un proxy verificador en P que reenvía los bytes crudos a A sin tocar `Host`, y un "S3" falso en Q (otro origen) con CORS PUT.
  - El proxy registra solo `{método, ruta, tipo de content-type, headerPresente, coincide}`; nunca guarda ni imprime bodies ni hashes.
- Escenarios por navegador:
  - S1: el HTML sin JS trae `disabled` (AC-10). S2: sin JS, Enter no produce ningún POST (AC-12).
  - S3: con JS el botón se habilita (AC-11) y la acción string coincide.
  - S4: el multipart coincide y la acción devuelve el tamaño correcto.
  - S5: Q recibe el PUT sin header y con su `Content-Type` original (AC-5).
  - S6: las acciones concurrentes coinciden (AC-6).
  - Se exige haber visto al menos un `text/plain` y un `multipart/form-data`.
- Artefacto real: tras `pnpm --filter @evzla/web build:aws`, `grep -rl x-amz-content-sha256 apps/web/.open-next/assets/_next/static` debe encontrar el chunk del interceptor.

AMENAZAS (activo · actor · vector · mitigación · test)
| Activo | Actor | Vector | Mitigación | Test |
|---|---|---|---|---|
| Function URL server e imagen | Internet | Invocación directa sin CloudFront (la imagen hoy no tiene ningún control) | AWS_IAM + OAC, sin permiso `*` (imagen R2, server R3) | T1, T4, AC-21, AC-22, AC-M1 |
| Permisos Lambda | Otra distribución o cuenta | Confused deputy | `SourceArn` fijo a la distribución de EvzlaStack, sin comodín | T3, AC-20 |
| Bodies (términos, cédulas) y su hash | Código propio, devtools, logs | Registro o persistencia del body; fuerza bruta de un hash de baja entropía | Módulo sin console/storage, `catch` sin binding, proxy C1 solo con booleanos, header fuera de la clave de caché, Distribution sin `Logging` | AC-8, T5, harness |
| Token de revalidación | Atacante, logs | Fuga por logs o caché; `Authorization` sobrescrita por la firma | `x-revalidate-token`, sin lectura dual, fuera de la cache policy, sin logs | AC-16, AC-17, AC-18, T5 |
| Disponibilidad de los POST | Usuario sin hidratar | Envío nativo sin hash → 403 | `HydratedSubmit` + guarda AST | AC-10..13, C1 S1/S2 |
| Upload a S3 | Interceptor | Header o reserialización hacia otro origen | Chequeo same-origin antes de leer el body | AC-5, C1 S5 |
| Firma NO_OVERRIDE / `x-origin-verify` | Viewer, Internet | `Authorization` para evitar la firma; pérdida de la segunda capa | NONE no autoriza nada extra y ALWAYS sobrescribe; el header se conserva solo en el origen server | T2, AC-21/22, L301, AC-23 |
| Estado de la URL tras emergencia | Operación | La CLI deja NONE sin que CloudFormation lo detecte | Reconciliación obligatoria | AC-M6 tras reconciliar |

RUNBOOK POR RELEASE (PR → main, aprobación Production, smoke de CI, fast-forward de develop)
- Solo datos sintéticos (`Persona Prueba`, `V-00000000`) o propios; nunca pegar bodies, hashes ni tokens en tickets o chats.
- R1 (C5 resuelto antes de aprobar):
  - Pre: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + chequeo del artefacto.
  - Post: AC-M3 (home, SSR, `/_next/image` con un parámetro nuevo, POST de búsqueda con el header visible en devtools sin copiar su valor); AC-M5 con `x-revalidate-token`; AC-M2.
  - Reversión: `workflow_dispatch` con `ref` = SHA previo a R1.
- R2 (diff: 2 literales de imagen + `EXPECTED`):
  - Post: AC-M1 imagen → 403; AC-M6; AC-M7 (`aws lambda get-policy` de server e imagen, solo lectura, con los dos permisos de CloudFront); AC-M3.
  - Reversión: `ref` = SHA de R1.
- R3 (**no se aprueba sin OK explícito del humano**; requiere C1 verde en los 3 navegadores sobre el commit de R3, C2 hecho, plan C3 escrito y C4 listo con nombres reales fuera del repo y una persona con credenciales presente). Diff: 2 literales del server + comentario + `EXPECTED`.
  - Smoke de CI: además de los GET, `POST /api/revalidate` sin `x-revalidate-token`, con body vacío y `x-amz-content-sha256: e3b0c442…b855`, exige exactamente 401 (la firma pasó; la app rechaza por token). 403 = firma SigV4 rechazada → el smoke falla con ese motivo, sin imprimir body ni headers, tras el mismo presupuesto de 5 intentos.
  - Post inmediato: POST de búsqueda; acción admin; Excel y dictado si aplica (AC-M4); AC-M5 con `x-revalidate-token` + `x-amz-content-sha256: e3b0c442…b855`; AC-M1 server → 403; AC-M6.
  - Si falla un POST: reversión normal `ref` = SHA de R2. Si no alcanza el tiempo, emergencia por CLI con credenciales humanas y sin pegar ARNs. **COMANDOS NO ENSAYADOS:**
    `aws lambda update-function-url-config --function-name <server> --auth-type NONE`
    `aws lambda add-permission --function-name <server> --statement-id emergency-public-url --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE`
    `aws lambda add-permission --function-name <server> --statement-id emergency-public-invoke --action lambda:InvokeFunction --principal '*' --invoked-via-function-url`
  - Reconciliación: `ref` = SHA de R2; luego `aws lambda remove-permission --function-name <server> --statement-id emergency-public-url` (y `emergency-public-invoke`); al final, AC-M6.

ROLLBACK / FLAG
- Sin feature flag (decisión vigente): `workflow_dispatch` al SHA anterior, en orden inverso. Al volver a NONE puede haber un 403 breve hasta que CloudFormation cree los permisos `*`; se acepta.

SKILLS A CARGAR EN IMPLEMENTACIÓN
- `.claude/skills/architecture.md`, `privacy-and-security.md`, `nextjs-frontend.md`, `testing-vitest.md`, `git-commits.md`, `orchestrator/agents/strict-tdd.md`.

DUDAS ABIERTAS
1. ADR-0012 debe recoger que desde R3 los llamadores de `/api/revalidate` envían `x-amz-content-sha256` (la spec ya lo recoge). Humano o archiver, junto con C5.
2. Tamaño máximo de audio y de Excel en modo `direct`: sin dato; el hash duplica el body en memoria del navegador. AC-M4 lo prueba con un archivo representativo.
3. `playwright` como devDep exacta de `apps/web` (decisión menor reversible); los navegadores se instalan en local y C1 no corre en CI. ¿Se acepta?
4. L301 y la forma de los orígenes se dedujeron leyendo el código de CDK, sin synth; las confirma la primera corrida de T2 y L301.
