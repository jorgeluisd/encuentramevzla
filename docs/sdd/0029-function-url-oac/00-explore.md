# 0029 function-url-oac: explore

RESUMEN
- Objetivo: Function URL (server, imagenes) de EvzlaStack de AuthType NONE a AWS_IAM, firmadas por CloudFront OAC; los POST deben seguir funcionando.
- Con OAC SigV4 y Lambda URL, un POST con body exige que el cliente envie el hash SHA-256 del body (header x-amz-content-sha256); si no, la firma falla.
- Todos los POST del sitio son Server Actions de Next 16.4.2: fetch POST con body de `encodeReply` y header `next-action`. No hay instrumentacion cliente hoy.
- No existe `apps/web/instrumentation-client.ts`; no hay CSP en next.config ni proxy; `crypto.subtle` no se usa.
- Vitest en apps/web solo corre `lib/**/*.test.ts` en entorno node (sin jsdom): codigo cliente nuevo tendria que vivir en `lib/` y ser testeable en node.
- Los tests de infra son pocos y ninguno fija authType; solo uno fija origenes/x-origin-verify.
- Hay formularios `action={...}` (envio nativo previo a hidratar) y `onSubmit`; solo los primeros son riesgo de POST sin hash.
- Deploy: un push a `main` = un deploy con aprobacion manual; dos fases implican dos releases a main.

CONTEXTOS Y CAPAS
- infra/ (`@evzla/infra`): `infra/lib/open-next-site.ts` (L147-157 URLs NONE, FunctionUrlOrigin sin OAC, policy ALL_VIEWER_EXCEPT_HOST_HEADER), `infra/test/evzla-stack.test.ts`.
- apps/web (presentacion/composition): `proxy.ts` (exige x-origin-verify, se conserva), `app/api/revalidate/route.ts`, formularios y `lib/actions/`.
- Capas core/db: no se tocan.

EXISTE (verificado)
- infra/test/evzla-stack.test.ts, tests relevantes:
  - L120 "serves through CloudFront...": solo Aliases, PriceClass, CacheBehaviors. No cambia.
  - L301 "sends x-origin-verify only to the server origin": filtra Origins por OriginCustomHeaders con x-origin-verify, espera 1 y que contenga "ServerFunction". Puede romper si OAC cambia la forma del origen (el origen sigue con custom header; revisar el filtro por nombre logico).
  - L101 "keeps the image function outside the VPC", L53 server Node 22/arm64/VPC, L179 permisos del rol del server: no tocan URL.
  - No hay ningun test de AuthType, `AWS::Lambda::Url`, `AWS::Lambda::Permission` ni `AWS::CloudFront::OriginAccessControl`. Nada fija NONE: ningun test existente fallaria por el cambio de authType; hay que agregar tests nuevos.
- Server Action en cliente (node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js, Next 16.4.2):
  - `fetchServerAction`: body = `await encodeReply(usedArgs, {temporaryReferences})` (react-server-dom; es string o FormData segun los args; con FormData como argumento sera FormData multipart).
  - Headers: Accept (RSC), `next-action` (actionId), `next-router-state-tree`, `x-deployment-id` si existe, `next-url` opcional.
  - Llama `fetch(state.canonicalUrl, {method:'POST', headers, body})` via wrapper `segment-cache/fetch` (`fetchInternal`), que respeta un override de `window.fetch` solo mientras hay lock; hay reintento si falla offline.
  - Consecuencia: es un punto interceptable (wrapper de `window.fetch` en el cliente) pero el body puede ser FormData/stream; calcular SHA-256 exige leerlo completo y `crypto.subtle` (solo contexto seguro).
- Formularios con `<form action={...}>` (envio nativo antes de hidratar; en ese caso el navegador manda POST multipart/urlencoded nativo, sin JS, por tanto sin hash):
  - components/search-panel.tsx L112 (`useActionState(searchAction)`), components/servicios/submit-service-form.tsx L34, report-service-button.tsx L39, manage-service-form.tsx L38 y L104, services-admin-browser.tsx (5 forms), app/admin/(protected)/layout.tsx L38/L93 (signOutAction), foreign-rows (page.tsx L57, foreign-row-actions), review (page.tsx L191, review-case-actions.tsx L98/L153).
- Formularios con `onSubmit` (JS necesario; no son Server Action nativa): app/admin/login/page.tsx (L79 verify, L133), admin ingesta, equipo, hospitales, cargar (5), _components/search-box.tsx. Estos llaman fetch/acciones desde JS. Falta confirmar cuales invocan Server Actions o rutas /api (ver dudas).
- next.config.ts: sin `headers()`/CSP. proxy.ts: solo verifica x-origin-verify (L13). No hay CSP en el repo, por lo que un script de instrumentacion no esta bloqueado por CSP.
- `crypto.subtle`: 0 usos en apps/web.
- apps/web/vitest.config.ts: environment node, include `lib/**/*.test.ts`.
- app/api/revalidate/route.ts: Authorization Bearer, incompatible con SigV4 (ya registrado); sin llamadores en repo.

HAY QUE CREAR (previsto, sin decidir enfoque)
- Cambios en infra/lib/open-next-site.ts (authType, OAC, permisos manuales InvokeFunction con invokedViaFunctionUrl).
- Tests nuevos en infra/test/evzla-stack.test.ts (authType AWS_IAM x2, OAC SigV4, permisos).
- Eventual codigo cliente para el hash del body y su test en `apps/web/lib/`; archivo de instrumentacion no existe.

DECISIONES PREVIAS
- ADR-0010: infra 100% AWS (Lambda/OpenNext/CloudFront), x-origin-verify como control de origen; no trata OAC ni Function URL IAM.
- ADR-0011: deploy via GitHub Actions + OIDC; `cdk deploy EvzlaStack` tras aprobacion manual del environment Production (solo rama main); orden migraciones a mano, merge, deploy; rollback con workflow_dispatch y ref de SHA anterior. El smoke test corre tras el deploy.
- Skill privacy-and-security: no loggear PII ni terminos; errores como `nombre:codigo` (`safeErrorTag`); cualquier script/log de instrumentacion no debe registrar bodies (contienen terminos de busqueda y cedulas).
- Skill nextjs-frontend: Server Actions reciben FormData en `apps/web/lib/actions/`, devuelven estado para `useActionState`; PWA sin Service Worker activo.
- CI (.github/workflows/deploy-production.yml): checks en PR a main/develop y push a main; job `deploy` solo en push a main (L89) con environment Production y `check-main-tip.mjs`. Cada fase que se despliegue requiere un merge a main y una aprobacion: dos fases = dos releases (y dos aprobaciones). Convencion de `docs/release-fast-forward-develop`: fast-forward de develop tras cada release.

RIESGOS
- Disponibilidad (alto): activar IAM sin cliente que envie hash rompe todo POST; el envio nativo previo a hidratar y cualquier cliente sin JS seguiran fallando. Al cambiar authType hay ventana de rotura en el deploy de CloudFormation (URL y distribution se actualizan por separado).
- Privacidad: el body de los POST contiene terminos de busqueda/cedulas; hashearlos en cliente no debe loggear ni exponer. No se encontraron fixtures personales relevantes (no se revisaron).
- Multi-tenancy/migracion de esquema/secretos: ninguno aplicable (no se toca BD ni secretos). x-origin-verify sigue como custom header del origen.
- Integracion: /api/revalidate con Bearer queda inutilizable bajo SigV4 si algun llamador externo no versionado existe.
- Concurrencia/idempotencia: el reintento offline de Next reenvia la accion; el hash debe recalcularse por intento.
- Los GET/HEAD no requieren hash; ISR via HEAD no se ve afectado.

INSUMOS FALTANTES
- Confirmar con el humano si hay llamadores externos de /api/revalidate (no bloquea).
- Sin otros insumos; no bloquea especificar.

DUDAS ABIERTAS
1. Que formularios `onSubmit` invocan Server Actions o POST a rutas /api (no se leyo cada handler).
2. Cobertura de CloudFront OAC para POST con FormData multipart grande (subida Excel en cargar/ingesta): limite de tamano del body y como se firma.
3. Estrategia para el envio nativo previo a hidratar y para clientes sin JS: no resuelta por el cliente; queda a decision de proposer.
4. Si el filtro del test L301 sobrevive a la nueva forma del origen (verificar con synth).
5. Una o dos fases de deploy (pre-requisito cliente primero, luego IAM) y su efecto en el numero de releases a main.
6. La imagen Function URL: sus peticiones son GET (`_next/image`), por lo que no necesitan hash; no se verifico otros metodos.
