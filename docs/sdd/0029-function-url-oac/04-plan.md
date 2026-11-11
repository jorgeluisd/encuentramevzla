# 0029 function-url-oac: plan

RESUMEN
- 3 releases, cada uno un PR propio a develop y luego release a main: R1 (T-1..T-10), R2 (T-11..T-13), R3 (T-14..T-18).
- R1 trae todo el código: interceptor, `HydratedSubmit`, guarda AST, `/api/revalidate`, OAC NO_OVERRIDE, permisos y harness C1. Las URL siguen NONE.
- R2 y R3 solo cambian literales de `open-next-site.ts` y `EXPECTED` del test (R3 además el comentario L147).
- Ninguna tarea despliega: el deploy lo dispara el humano. El `cdk diff` de cada release es un paso manual que se muestra al humano antes de pedir merge.
- C1 (T-8) bloquea R3 y se vuelve a correr sobre el commit de R3 (T-16).
- Tareas que dependen de `playwright` (pendiente de aprobación en GATE 1): T-8 y T-16, más la parte de T-1 que lo agrega como devDep. Sin aprobación no hay C1 y R3 queda bloqueado.
- Sin DDL, sin cambios en core, db, `proxy.ts` ni `x-origin-verify`. Datos de prueba solo sintéticos.
- Hay DUDAS ABIERTAS al final.

Convención: todas las tareas dejan `pnpm typecheck && pnpm test` en verde. Skills comunes: architecture, testing-vitest, strict-tdd, privacy-and-security.

## R1 — interceptor, control de envío, revalidación, OAC NO_OVERRIDE (URLs NONE)

T-1 · presentation (lib) · TDD: ON (lógica con riesgo de privacidad) · alcance: estricto · modelo: capaz · skills: privacy-and-security, nextjs-frontend · depende de: — · cubre AC-1..AC-8 · terminado cuando: `content-hash-fetch.test.ts` verde (hash por bytes UTF-8, FormData serializado una vez, POST vacío = `e3b0…b855`, GET/HEAD intactos, otro origen idéntico, sin `subtle` sin header, sin estado entre llamadas, escaneo estático sin console/storage/`catch (`) · archivos: `apps/web/lib/origin-signing/content-hash-fetch.ts`, `apps/web/lib/origin-signing/content-hash-fetch.test.ts`

T-2 · presentation (composition root cliente) · TDD: OFF (cableado de una línea; lo cubren AC-9 en T-8 y el chequeo del artefacto en T-9) · alcance: pragmático · modelo: económico · skills: nextjs-frontend · depende de: T-1 · cubre AC-9 (parcial) · terminado cuando: `installContentHashFetch(window)` se invoca desde `instrumentation-client.ts` y typecheck pasa · archivos: `apps/web/instrumentation-client.ts`

T-3 · presentation (lib) · TDD: ON · alcance: estricto · modelo: económico · skills: nextjs-frontend, testing-vitest · depende de: — · cubre AC-10 (SSR), AC-11 · terminado cuando: `use-hydrated.test.ts` verifica con `react-dom/server` que el render de servidor devuelve `false` · archivos: `apps/web/lib/origin-signing/use-hydrated.ts`, `apps/web/lib/origin-signing/use-hydrated.test.ts`

T-4 · ui · TDD: OFF (componentes delgados; se prueban vía la guarda de T-5 y C1) · alcance: pragmático · modelo: económico · skills: nextjs-frontend · depende de: T-3 · cubre AC-10, AC-11, AC-14 (componente) · terminado cuando: `HydratedSubmit` (disabled = !hydrated || disabled; pasa `formAction`, `name`, `value`, `variant`, `title`) y `JsRequiredNotice` (`<noscript>` en español) compilan · archivos: `apps/web/components/ui/hydrated-submit.tsx`, `apps/web/components/ui/js-required-notice.tsx`

T-5 · ui + test · TDD: ON (la guarda se escribe primero y falla; luego se migran los formularios, dentro de la misma tarea para no dejar el repo en rojo) · alcance: pragmático en UI, estricto en la guarda · modelo: económico (guarda AST: capaz) · skills: nextjs-frontend, testing-vitest · depende de: T-4 · cubre AC-10, AC-12, AC-13, AC-14 · terminado cuando: la guarda detecta los 15 formularios (mínimo exigido), pasa en verde, sus casos negativos inline fallan con `archivo:línea:col`; los 5 formularios públicos incluyen `JsRequiredNotice`; "Fusionar" sigue `type="button"`; `SubmitButton` de foreign-row-actions envuelve `HydratedSubmit` con `formAction` y `disabled={pending}` · archivos: `apps/web/lib/origin-signing/hydrated-submit-guard.test.ts`, los 9 archivos de formularios (`search-panel`, `submit-service-form`, `report-service-button`, `manage-service-form`, `services-admin-browser`, `(protected)/layout`, `review-case-actions` y `foreign-row-actions`) bajo `apps/web/app/**` y `apps/web/components/**` (rutas exactas las fija el implementer con la guarda; cualquier archivo adicional debe aparecer en el diff y justificarse)

T-6 · application/presentation (handler + ruta) · TDD: ON · alcance: estricto · modelo: capaz (seguridad) · skills: privacy-and-security, nextjs-frontend · depende de: — · cubre AC-15, AC-16, AC-17, AC-18 · terminado cuando: `handleRevalidate` lee solo `x-revalidate-token`; 200 / 401 `unauthorized` (también con solo `Authorization: Bearer`) / 503 `not_configured`; no lee body, no loggea; la ruta compone `appSecret("REVALIDATE_TOKEN")` y `revalidatePath("/")` · archivos: `apps/web/lib/revalidation/revalidate-request.ts`, `apps/web/lib/revalidation/revalidate-request.test.ts`, `apps/web/app/api/revalidate/route.ts`

T-7 · infrastructure (CDK) · TDD: ON (el `describe("function URL access (ADR-0012)")` se escribe antes y falla) · alcance: estricto · modelo: capaz (seguridad de infra) · skills: architecture, privacy-and-security · depende de: — · cubre AC-19, AC-20, AC-23, AC-24, AC-26 (infra) · terminado cuando: T1..T6 verdes con `EXPECTED` R1 (NONE/NONE, ambos no-override); `ServerOac` e `ImageOac` creados en el sitio; permiso manual `CloudFrontInvokeViaUrl` en server e imagen con `SourceArn` a la distribución; L120 y L301 sin cambios y verdes; comentario L147 dice que hay OAC NO_OVERRIDE sobre URLs NONE durante la secuencia de ADR-0012 · archivos: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`

T-8 · test (harness C1, local, no corre en `pnpm test`) · TDD: OFF (es un harness de verificación) · alcance: pragmático · modelo: económico · skills: nextjs-frontend, testing-vitest · depende de: T-2, T-5; **depende de playwright (pendiente GATE 1)** · cubre AC-9, AC-10, AC-11, AC-12, AC-5, AC-6 (reales) · terminado cuando: `pnpm --filter @evzla/web test:content-hash` pasa escenarios S1..S6 en chromium, webkit y firefox; se vio al menos un `text/plain` y un `multipart/form-data`; el proxy registra solo booleanos, nunca bodies ni hashes; `e2e/**` excluido del tsc y del lint de la app, `e2e/**/.next/**` ignorado en git · archivos: `apps/web/e2e/content-hash/run.mjs`, `apps/web/e2e/content-hash/fixture/**`, `apps/web/package.json` (devDep `playwright` exacta + script `test:content-hash`), `pnpm-lock.yaml`, `apps/web/tsconfig.json`, `apps/web/eslint.config.mjs`, `.gitignore`

T-9 · config (verificación) · TDD: OFF (solo comandos) · alcance: pragmático · modelo: económico · skills: delivery-workflow · depende de: T-1..T-8 · cubre AC-26, AC-9 (artefacto) · terminado cuando: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes, y tras `pnpm --filter @evzla/web build:aws` el grep de `x-amz-content-sha256` en `apps/web/.open-next/assets/_next/static` encuentra el chunk del interceptor · archivos: ninguno (sin cambios)

T-9b · fix (hallazgos medios M1..M4 de 06-code-review.md, autorizado por el humano el 2026-11-10) · TDD: ON · alcance: estricto · modelo: estándar · skills: strict-tdd, nextjs-frontend, testing-vitest · depende de: T-9 · cubre AC-5, AC-6, AC-9, AC-13 · terminado cuando: (M1) un test con URL string, headers propios (`Next-Action`), `AbortSignal` y `credentials` comprueba que llegan a la petición firmada y mata el mutante `new Request(..., { method, body })`; (M2) un test de fallback con `Request` de entrada comprueba `bodyUsed === false` y mata el mutante sin `input.clone()`; (M3) las URL relativas se resuelven contra la URL del documento (`location.href`) con test de `""`, `"?x"` y `"api/x"` desde una ruta anidada; (M4) la guarda AST trata `<input type="submit">` e `<input type="image">` dentro de `<form action>` como envío nativo y falla si no van gateados; `pnpm lint && pnpm typecheck && pnpm test` verdes · archivos: `apps/web/lib/origin-signing/content-hash-fetch.ts`, `apps/web/lib/origin-signing/content-hash-fetch.test.ts`, `apps/web/instrumentation-client.ts` (solo si cambia la firma de deps), `apps/web/lib/origin-signing/hydrated-submit-guard.test.ts`

T-10 · PASO MANUAL, no automatizable · `cdk diff` de R1 · depende de: T-9 · terminado cuando: el implementer corre `cdk diff` desde `infra/` y muestra el resultado al humano antes de pedir merge; el diff esperado son OAC lambda nuevos y permisos nuevos, URLs sin cambio de `AuthType`. No se corre `cdk deploy` · archivos: ninguno

Bloqueo de R1: la duda 1 (llamadores externos de `/api/revalidate`, C5) debe estar resuelta antes de aprobar el release. Post-deploy (humano): AC-M2, AC-M3, AC-M5.

## R2 — Function URL de imágenes a AWS_IAM + SIGV4_ALWAYS

T-11 · infrastructure (CDK) · TDD: ON (se cambia primero `EXPECTED` a imagen AWS_IAM/always y falla) · alcance: estricto · modelo: capaz · skills: architecture, privacy-and-security · depende de: R1 en develop (T-7) · cubre AC-21, AC-23, AC-24, AC-26 · terminado cuando: solo cambian el `authType` y el `signing` de la imagen y `EXPECTED`; la URL del server sigue NONE + no-override; T4 confirma que desaparecen los permisos `*` de la imagen · archivos: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`

T-12 · config (verificación) · TDD: OFF · alcance: pragmático · modelo: económico · skills: delivery-workflow · depende de: T-11 · cubre AC-26 · terminado cuando: `pnpm typecheck && pnpm test && pnpm build` verdes y el diff contiene solo los archivos de T-11 · archivos: ninguno

T-13 · PASO MANUAL, no automatizable · `cdk diff` de R2 · depende de: T-12 · terminado cuando: se muestra al humano el `cdk diff` (2 literales de imagen); el humano lo revisa antes del merge. No se despliega. Post-deploy (humano): AC-M1 imagen, AC-M3, AC-M6, AC-M7 · archivos: ninguno

## R3 — Function URL del server a AWS_IAM + SIGV4_ALWAYS (no se aprueba sin OK explícito del humano)

T-14 · infrastructure (CDK) · TDD: ON (`EXPECTED` primero) · alcance: estricto · modelo: capaz · skills: architecture, privacy-and-security · depende de: R2 en develop (T-11) · cubre AC-22, AC-23, AC-24, AC-25, AC-26 · terminado cuando: solo cambian el `authType` y el `signing` del server, `EXPECTED` y el comentario L147 (ya no dice "públicas por diseño"; remite a ADR-0012 y a que los POST llevan `x-amz-content-sha256` calculado en el navegador); ninguna `AWS::Lambda::Permission` con principal `*` sobre estas funciones · archivos: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`

T-15 · test (docs de operación) · TDD: OFF · alcance: pragmático · modelo: económico · skills: delivery-workflow · depende de: T-14 · cubre AC-M5 (contrato) · terminado cuando: se confirma que ADR-0012 ya recoge que `/api/revalidate` exige `x-amz-content-sha256` desde R3 (no requiere edición); si faltara, se avisa al humano, no se edita desde el plan · archivos: ninguno

T-16 · PASO DE VERIFICACIÓN (C1 sobre el commit de R3) · TDD: OFF · alcance: pragmático · modelo: económico · depende de: T-14; **depende de playwright (pendiente GATE 1)** · cubre AC-9..AC-12 · terminado cuando: `pnpm --filter @evzla/web test:content-hash` verde en chromium, webkit y firefox sobre el commit de R3 · archivos: ninguno

T-17 · config (verificación) · TDD: OFF · alcance: pragmático · modelo: económico · depende de: T-14, T-16 · cubre AC-26 · terminado cuando: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes · archivos: ninguno

T-18 · PASO MANUAL, no automatizable · `cdk diff` de R3 · depende de: T-17 · terminado cuando: se muestra al humano el `cdk diff` (2 literales del server + comentario) antes de pedir merge. No se despliega. Requisitos del humano antes de aprobar: C1 verde, C2 hecho, plan C3 escrito, C4 listo (credenciales de emergencia con nombres reales fuera del repo y una persona presente). Post-deploy (humano): AC-M1 server, AC-M3, AC-M4, AC-M5 (con `x-amz-content-sha256` del body vacío), AC-M6 · archivos: ninguno

MARCAS: cross-tenant → ninguna (S-5: no aplica tenant) · migración → ninguna de BD; las "migraciones" son de infraestructura: T-7 (R1), T-11 (R2), T-14 (R3) · datos personales → T-1 (bodies con términos y cédulas, no se persisten ni loggean), T-6 (token de revalidación), T-5 (formularios de búsqueda y carga)

PARA EL GATE 1
1. Aprobar `playwright` como devDep exacta de `apps/web` (afecta T-8 y T-16; los navegadores se instalan en local y C1 no corre en CI). Sin aprobación, C1 no existe y R3 no puede aprobarse.
2. Confirmar que T-5 (guarda + migración de los 15 formularios) va como una sola tarea.
3. Ninguna tarea tiene `TDD: ?`.

DUDAS ABIERTAS
1. C5: llamadores externos de `/api/revalidate` (bloquea aprobar R1; humano).
2. C4: quién tiene credenciales de emergencia durante R3 y en qué horario (bloquea aprobar R3; humano).
3. Tamaño máximo de audio y Excel en modo `direct`; lo cubre AC-M4 con un archivo representativo.
4. L301 y la forma de los orígenes no se confirmaron con synth; los confirma la primera corrida de T-7.
5. Límite de body de CloudFront OAC para multipart grande: no verificado; AC-M4.
6. La lista exacta de rutas de los 9 archivos de formularios la fija el implementer (T-5); el verifier compara contra el diff.
