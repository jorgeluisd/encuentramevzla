# 0029 function-url-oac: code review (R1, T-1..T-9)

Alcance: `git diff develop...HEAD` (aed1b9d). Revisado contra 03-design, 02-spec, 04-plan y 05-apply-progress. No se ejecutó nada contra AWS.

RESUMEN: 12 hallazgos (0 alta / 4 media / 8 baja) · veredicto: APROBADO (sin altas; las medias las decide el humano en GATE 2)

Evidencia de las medias 1 y 2: se corrió la suite unitaria del interceptor contra dos mutantes en el scratchpad (el repo no se tocó). Los dos pasan 22/22:
- (a) `new Request(..., { method: init?.method, body: init?.body })`, que pierde `init.headers`, `signal` y `credentials`.
- (b) `new Request(input instanceof Request ? input : url, init)`, sin `.clone()`.

| Sev | Archivo:línea | Hallazgo | Regla (skill §) | Qué se espera |
|---|---|---|---|---|
| Media | apps/web/lib/origin-signing/content-hash-fetch.test.ts:45-71, 129-136 | Ningún test con URL string comprueba que `init.headers` (p. ej. `next-action`, `accept`, `next-router-state-tree`), `signal` y `credentials` lleguen a la petición firmada. Es justo el camino real de Next (`fetch(state.canonicalUrl, { method, headers, body })`). El mutante (a) rompería todos los Server Actions y `pnpm test` seguiría verde; solo lo detecta C1, que es manual y no corre en CI. | testing-vitest: tests de comportamiento; un test que pasaría con el código mal es hallazgo | Un caso string + `init` con headers propios y un `AbortSignal`: assert de cada header en el `Request` enviado y de que abortar ese signal aborta la petición enviada (`sent.signal.aborted`). |
| Media | apps/web/lib/origin-signing/content-hash-fetch.test.ts:110-127 | El test de fallback solo usa FormData. El diseño (BORDE, paso 4) promete que el `Request` de entrada queda intacto gracias a `input.clone()`, pero ningún test lo cubre: sin `.clone()` (mutante b), el fallback enviaría un body ya consumido y la suite sigue en 22/22. | testing-vitest; design BORDE paso 4 | Un caso de fallback con `Request` POST de entrada y `digest` que falla: assert de que el `Request` enviado es el original, con `bodyUsed === false` y su body legible. |
| Media | apps/web/lib/origin-signing/content-hash-fetch.ts:44 | Las URL relativas se resuelven contra `deps.origin`, no contra la URL del documento. `fetch("")`, `fetch("?x=1")` o `fetch("api/x")` en `/servicios/abc` acabarían en `/`, `/?x=1` o `/api/x`; el `fetch` nativo las resuelve contra `document.baseURI`. Afecta a todo POST/PUT/PATCH/DELETE same-origin desde R1, no solo tras R3. Hoy no hay ningún llamador así (Next usa `canonicalUrl`, que empieza por `/`), así que es un defecto latente en un reemplazo global de `fetch`. | nextjs-frontend / design INV-SAME-ORIGIN-ONLY (paso 2 asume URL absoluta o absoluta respecto del host) | Resolver contra la URL del documento (inyectar `baseUrl: win.location.href` o `document.baseURI` y comparar con `origin`), más un test con URL relativa a la ruta y con `""`. |
| Media | apps/web/lib/origin-signing/hydrated-submit-guard.test.ts:72-76 | La guarda solo revisa `button`/`Button`. No marca `<input type="submit">` ni `<input type="image">` dentro de un `<form action>`. Si uno de esos queda antes del `HydratedSubmit`, pasa a ser el botón por defecto y Enter envía antes de hidratar. AC-13 pasaría en verde. | spec AC-13 / design guarda (c) | Tratar `input` con `type` `submit` o `image` como submit no controlado, con un caso negativo inline. |
| Baja | apps/web/e2e/content-hash/run.mjs:211-218 | Probablemente S6 no prueba concurrencia en la red: la cola de acciones del router de Next ejecuta los Server Actions en serie. La concurrencia real solo la prueba el unit (content-hash-fetch.test.ts:180). Hay que verificarlo en `app-router-instance`/action queue de Next 16.4.2. | testing-vitest: el nombre describe lo que se prueba | Disparar dos `fetch` POST same-origin en paralelo desde la página, o renombrar el escenario como "acciones consecutivas". |
| Baja | apps/web/e2e/content-hash/run.mjs:200-209 | S5 comprueba que no hay header y que se conserva el `Content-Type`, pero no que los bytes lleguen idénticos. AC-5 exige además "sin reserializar". | spec AC-5 | Que el S3 falso registre el booleano `bytesMatch` contra `S3_BYTES`. |
| Baja | apps/web/lib/origin-signing/hydrated-submit-guard.test.ts:10-15 | La lista de archivos públicos de AC-14 está fija. Un formulario público nuevo no tendría que llevar `JsRequiredNotice`, pero sí pasaría la guarda de AC-13. | spec AC-14 | Aceptable si queda documentado. Si no, derivar los formularios públicos por ruta (todo lo que no esté en `app/admin/**`). |
| Baja | apps/web/lib/origin-signing/hydrated-submit-guard.test.ts:119 | En T-8 la guarda llegó al timeout de 5 s en disco lento (05-apply-progress, T-8). Puede volverse flaky. | testing-vitest (determinismo) | Escanear y parsear una sola vez por archivo (hoy los 4 públicos se parsean dos veces) o fijar un timeout explícito con justificación. |
| Baja | apps/web/eslint.config.mjs:22 | `e2e/**` queda fuera del lint, así que el harness entero no se lintea. El diseño (línea 23) pedía ignorar solo `e2e/**/.next/**`; el plan T-8 dice `e2e/**`. La contradicción viene de los artefactos y no se resolvió. | design PIEZAS vs plan T-8 | Ignorar solo `e2e/**/.next/**` y `next-env.d.ts`, o dejar la decisión registrada en apply-progress. |
| Baja | apps/web/app/api/revalidate/route.ts:7 | La línea 7 describe el *qué* de la ruta; la línea 8 sí es un *porqué* válido. | CLAUDE.md §4 comentarios | Quitar la línea 7 o fundirla con el porqué. |
| Baja | apps/web/e2e/content-hash/run.mjs:1-2 | El encabezado describe qué hace el archivo. Solo la línea 3 (restricción de privacidad) es un *porqué*. | CLAUDE.md §4 comentarios | Dejar solo la restricción de privacidad. |
| Baja | apps/web/lib/origin-signing/content-hash-fetch.test.ts:112 | `as unknown as SubtleCrypto` sin justificación en apply-progress. Es un fake de test, de bajo impacto. | política de escapes del sistema de tipos | Tipar el fake como `Pick<SubtleCrypto, "digest">` y que `ContentHashFetchDeps.subtle` acepte ese `Pick`, o justificarlo. |

Notas sin severidad:
- manage-service-form.tsx:87 y :111: la misma tarjeta muestra dos `<noscript>` con el mismo texto. Es cosmético y no rompe AC-14.
- Revisé y está correcto: `methodOf` respeta `init.method` sobre el del `Request`; `fetch(prepared)` va fuera del `try`, así que no hay reintento; `catch` sin binding; los headers del body (multipart con boundary, `text/plain;charset=UTF-8`) salen de `source.headers`; `new Request(source, { headers, body })` sigue el `signal` de `source`. Un `ReadableStream` sin `duplex` cae al fallback y rechaza igual que el nativo, como asume el diseño. Con `duplex` y un fallo en `digest`, el stream original queda bloqueado; el diseño lo acepta porque la app no usa streams.

FIDELIDAD AL DISEÑO
- Piezas previstas → encontradas:
  - `content-hash-fetch.ts`: sin imports ✓
  - `use-hydrated.ts`: solo importa `react` ✓
  - `hydrated-submit.tsx`: `"use client"`, imports `./button` y `@/lib/origin-signing/use-hydrated` ✓
  - `js-required-notice.tsx`: sin `"use client"` ✓
  - `instrumentation-client.ts` ✓
  - `revalidate-request.ts`: sin imports ✓
  - `route.ts`: `next/cache`, app-secrets y revalidate-request; se quitó `next/server` ✓
  - `open-next-site.ts`: `aws-iam`, `ServerOac`/`ImageOac` `SIGV4_NO_OVERRIDE` creados en el sitio, `CloudFrontInvokeViaUrl` en un `for` tras la distribución ✓
  - Tests de infra T1..T6 ✓; L120 y L301 sin cambios ✓
  - Harness y fixture ✓
- Desviaciones declaradas y aceptables:
  - 8 archivos de formularios en lugar de 9; el plan enumera 8.
  - `HydratedSubmitProps = Omit<ButtonProps, "type">`, más amplio que la lista del diseño.
  - El body de error pasa de `error` a `code`.
  - El guard importa `node:url` además de los imports previstos.
- Desviación sin resolver: el ignore de lint de `e2e/**` (ver tabla).
- Inventario de formularios: los 15 `<form action>`/`formAction` de `app/` y `components/` usan `HydratedSubmit`. "Fusionar", "Cancelar" y "Más info" siguen `type="button"`. Los formularios `onSubmit` quedan fuera de alcance según la spec.

TESTS (AC → test)
- AC-1 → content-hash-fetch.test.ts:45, :129 · AC-2 → :57 · AC-3 → :138 · AC-4 → :73, :203 · AC-5 → :84 y C1 S5 · AC-6 → :165, :180 y C1 S6 (débil, ver tabla) · AC-7 → :100 · AC-8 → :110 (espías) y :214 (escaneo estático)
- AC-9 → C1 S3/S4 · AC-10 → use-hydrated.test.ts:11 y C1 S1 · AC-11 → C1 `hydratedPage` · AC-12 → C1 S2
- AC-13 → hydrated-submit-guard.test.ts:119 más los negativos de :134-191 · AC-14 → :125
- AC-15..AC-18 → revalidate-request.test.ts:15, :23, :46, :54; la parte de caché de AC-18 → evzla-stack T5
- AC-19 → T2 · AC-20 → T3 · AC-23 → L301 sin cambios · AC-24 → T6 y L120 · AC-26 → verifier
- Tests débiles:
  - Preservación de headers, signal y credentials de `init`: sin cobertura (mutante a).
  - Fallback con `Request` de entrada: sin cobertura (mutante b).
  - S6 probablemente serial.
  - S5 no compara los bytes.

DEUDA INTRODUCIDA
- `as unknown as SubtleCrypto` en content-hash-fetch.test.ts:112, sin justificar.
- `e2e/**` fuera de lint y de tsc de la app (decisión del plan; el fixture lo typechequea `next build`).
- Sin `TODO`/`FIXME`, `any`, `eslint-disable` ni `@ts-ignore` nuevos.

OBSERVACIONES PARA archiver / security-reviewer (no son hallazgos de este diff)
- revalidate-request.ts:10 compara el token con `!==`, igual que antes. Si se quiere tiempo constante, lo decide el security-reviewer; el apply-progress ya lo anotó.
- Ya existía antes de este diff: los formularios `onSubmit` (p. ej. el login admin) hacen, antes de hidratar, un envío nativo GET con los campos en la query string. No les afecta OAC porque es GET, pero el email del login puede acabar en la URL. Conviene evaluarlo aparte.

## Re-revisión T-9b (aa0dd96)

Alcance: solo `git show aa0dd96`. Comando: `pnpm --filter @evzla/web exec vitest run lib/origin-signing --reporter=dot` → `Test Files 3 passed (3)`, `Tests 38 passed (38)` (29 del interceptor, 8 de la guarda, 1 de `use-hydrated`); la guarda AC-13 no llegó al timeout.

RESUMEN: M1..M4 resueltas · 0 hallazgos nuevos altos ni medios, 1 baja · veredicto: APROBADO

| Hallazgo | Veredicto | Evidencia |
|---|---|---|
| M1 headers/signal/credentials | Resuelta | content-hash-fetch.test.ts:144-163: URL string + `Next-Action`, `accept`, `credentials: "include"` y `AbortSignal`. Comprueba que abortar el signal propio aborta la petición enviada. Mata los mutantes a, a2 y a3 (RED registrados en apply-progress T-9b). |
| M2 fallback con `Request` | Resuelta | :132-142. El `Request` enviado es el original (`toBe`), con `bodyUsed === false` y el body legible. Mata el mutante b. |
| M3 URL relativas | Resuelta | content-hash-fetch.ts:44-46: resuelve contra `location.href`, que se lee en cada llamada, y decide mismo origen con `page.origin`. Tests :239-262: `""`, `"?x=1"` y `"api/x"` desde `/servicios/abc`, más la navegación de cliente posterior a la instalación. Esto mata también los mutantes "resolver contra `page.origin`" y "leer `href` al instalar". `//evil.test/buscar` (:91) se resuelve a `https://evil.test` y pasa intacto (`input` e `init` por identidad). Los otros casos cross-origin siguen pasando sin cambios. |
| M4 guarda `input` submit/image | Resuelta | hydrated-submit-guard.test.ts:35-51, :89-92 y :183-217. `input`/`Input` con `type` literal `submit` o `image` dentro de `<form action>` es violación. Caso negativo: el mismo `input` dentro de `<form onSubmit>` no se marca. El escaneo real de app/ y components/ sigue en verde, así que no hay inputs submit sin gatear. |

Cambios colaterales revisados:
- Deps públicas `origin` → `location: { readonly href }`. El único llamador es instrumentation-client.ts:3 (`installContentHashFetch(window)`): `window.location` cumple el tipo y se pasa el objeto vivo, no una copia. No queda ninguna referencia a `deps.origin`. Sin efectos en `@evzla/core` ni en el paquete de contratos.
- Timeouts de 30 s (hydrated-submit-guard.test.ts:135-146) solo en los dos tests que leen de disco. Usan la firma `it(name, { timeout }, fn)`, válida en Vitest 4. El comentario de 2 líneas explica un *porqué* (el disco externo tarda ~6 s), así que es admisible. Con esto la baja anterior de :119 queda mitigada, aunque los 4 archivos públicos se siguen parseando dos veces.
- El escape `as unknown as SubtleCrypto` solo se movió a nivel de módulo (content-hash-fetch.test.ts:37). Sigue siendo la baja ya registrada; no es deuda nueva.

| Sev | Archivo:línea | Hallazgo | Regla (skill §) | Qué se espera |
|---|---|---|---|---|
| Baja | apps/web/lib/origin-signing/hydrated-submit-guard.test.ts:47-51 | Asimetría con `button`. Un `<button>` con `type` no literal se marca, pero `<input type={x}>` dentro de `<form action>` no, aunque `x` puede valer `"submit"`. Hoy no hay ninguno en app/ ni components/. | spec AC-13 / design guarda (c) | Marcar también `input`/`Input` con `type` no literal (por expresión o spread) dentro de `<form action>`, o dejar registrada la limitación. |

Nota sin severidad: el `fetch` nativo resuelve contra la URL base del documento (`document.baseURI`, que respeta `<base href>`), no contra `location.href`. Como la app no usa `<base>` en app/, hoy dan lo mismo. Si algún día se añade `<base>`, hay que revisar esta decisión.

DEUDA INTRODUCIDA (aa0dd96): ninguna nueva. No hay `TODO`, `FIXME`, `any`, `eslint-disable`, `@ts-ignore` ni casts nuevos.
