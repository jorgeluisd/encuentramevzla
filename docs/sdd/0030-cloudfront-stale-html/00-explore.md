# 0030 cloudfront-stale-html — explore

RESUMEN
- El HTML prerenderizado (/, /buscar, /confianza, /emergencias) sale con `s-maxage=31536000` y CloudFront (E2AKNZ10L06E05) lo guarda hasta 1 año: ningún paso del deploy ni de la revalidación invalida la CDN.
- OpenNext 4.1.8 sí trae un override `cdnInvalidation: "cloudfront"` (no hay flag `automaticCdnInvalidation`); está apagado: `apps/web/open-next.config.ts` solo tiene `default: {}` y se usa el `dummy`.
- Efecto: tras cada deploy el HTML viejo apunta a Server Action ids inexistentes (409) y sin el interceptor de 0029 (R3 lo volvería 403).

CONTEXTOS / CAPAS
- Infra (CDK): `infra/lib/open-next-site.ts`, `infra/lib/ci-stack.ts`, `infra/lib/evzla-stack.ts`. CI: `.github/workflows/deploy-production.yml`.
- Presentación: `apps/web/app/api/revalidate/route.ts`, `apps/web/open-next.config.ts`. Dominio/aplicación: no se tocan.

EXISTE
- `open-next-site.ts` ~L176-192: `ServerCachePolicy` (default 0, min 0, max 365d; key con todas las cookies, todos los querystrings, headers accept/rsc/next-*/x-prerender-revalidate). Behavior por defecto = server Lambda vía Function URL+OAC; `_next/image*` y S3 aparte. Assets sin versionar con `s-maxage=31536000` (BucketDeployment ~L282-287).
- BucketDeployment `VersionedAssets` con `prune:false` (chunks viejos quedan en S3). Cola FIFO `RevalidationQueue`, tabla de tags DynamoDB (GSI `revalidate`), `RevalidationFunction` con SqsEventSource, bucket de caché (`CACHE_BUCKET_*`). Role del server: grantReadWrite cache bucket, tag table, sendMessages a la cola; NO tiene permisos de CloudFront ni `CLOUDFRONT_DISTRIBUTION_ID` en su entorno (L99-105).
- Origen del s-maxage: `dist/core/routing/util.js` L222-226 (`fixCacheControlForHtmlPages`: fuerza `public, max-age=0, s-maxage=31536000, must-revalidate` a HTML pages) y `fixISRHeaders` (L305-338: REVALIDATED -> no-store; STALE -> `s-maxage=2, stale-while-revalidate=2592000`; HIT con s-maxage != 31536000 -> TTL restante).
- Invalidación nativa: `dist/overrides/cdnInvalidation/cloudfront.js` (CreateInvalidation de `/${path}` y `/${path}?_rsc=*` usando env `CLOUDFRONT_DISTRIBUTION_ID`), llamado desde `dist/adapters/cache.js` L336-339 y L416 solo en el flujo de tags (`revalidateTag`/soft tags); el comentario en el código dice que no aplica a `res.revalidate()`. Hay que verificar si `revalidatePath("/")` pasa por esa rama en Next 16 (probable vía tags, no confirmado). Falta confirmar si `@aws-sdk/client-cloudfront` queda empaquetado en el bundle del server.
- Revalidate route: `POST /api/revalidate` con token `x-revalidate-token`, hace `revalidatePath("/")`; solo regenera en origen (cache bucket + tag table), CloudFront no se entera.
- Deploy: job build (lint, typecheck, test, audit, build:aws, check-bundle) y job deploy (`check-main-tip`, synth, assume `evzla-github-deploy`, `cdk deploy EvzlaStack`, summary, `smoke.mjs https://encuentramevzla.com`). Sin paso de invalidación.
- Rol CI `evzla-github-deploy` (ci-stack.ts L40-42): su única política es `sts:AssumeRole` sobre los roles de bootstrap CDK (deploy, file-publishing, lookup en sa-east-1 y us-east-1); OIDC restringido a `environment:Production`. Hoy NO puede crear invalidaciones.
- Páginas: estática `/` con `force-static`; `/buscar`, `/confianza`, `/emergencias` sin `dynamic` (prerender por defecto). `force-dynamic`: `/servicios`, `/servicios/editar/[token]`, todo `/admin/(protected)/*`. `/api/*` dinámico.
- Tests que fijan el comportamiento: `infra/test/evzla-stack.test.ts` L107 (cola FIFO + tag table), L414-426 (token/body hash fuera de la clave, sin access logs, behaviors); `infra/test/ci-stack.test.ts` (política del rol CI, probablemente fija solo sts:AssumeRole); `infra/test/ci-workflow.test.ts` (pasos/orden del workflow); `infra/test/ci-scripts.test.ts`; `infra/test/open-next-output.test.ts`. Cualquier cambio de política/paso exige actualizarlos.

HAY QUE CREAR (según dirección elegida)
- A deploy: paso en workflow tras `cdk deploy` con `aws cloudfront create-invalidation` (o script `infra/scripts/ci/invalidate.mjs` + test) y statement IAM `cloudfront:CreateInvalidation` en `ci-stack.ts` (recurso: ARN de la distribución; requiere el id desde `cdk-outputs.json` o fijo) + tests.
- B revalidate: override `cdnInvalidation: "cloudfront"` en `open-next.config.ts`, `CLOUDFRONT_DISTRIBUTION_ID` en env del server (ojo: dependencia circular Lambda <-> Distribution en CDK; resolver con id por parámetro/secreto o wildcard), `cloudfront:CreateInvalidation` al rol del server, y tests de stack.
- C TTL: `ResponseHeadersPolicy` con override de Cache-Control, o `maxTtl` menor en `ServerCachePolicy` (CloudFront recorta s-maxage al maxTtl), o `stale-while-revalidate`; test de política.

DIRECCIONES CANDIDATAS (sin recomendación)
1. Invalidar en deploy (`/*` o rutas HTML): corrige el síntoma de 0029 en cada release; no cubre revalidación on-demand. Ventana entre `cdk deploy` y la invalidación; si falla debe fallar el workflow (o advertir) antes del smoke.
2. Invalidar en revalidate (OpenNext nativo): cubre `/api/revalidate`; no cubre deploys nuevos salvo que el deploy dispare revalidación; añade permisos al rol de Lambda dentro de la VPC (¿ruta de red a la API de CloudFront? requiere NAT/endpoint, verificar `vpc`/subnets en L95-97).
3. Reducir `maxTtl` (ej. 5 min-1 h) o forzar Cache-Control para HTML: sin permisos nuevos, autocorrige y acota la obsolescencia; más hits al origen (hoy "cero invocations") y costo de Lambda/RDS; el cambio de `maxTtl` altera la política (replace de CachePolicy no necesario, es update).
4. Combinación (1 + 3, o 1 + 2): defensa en profundidad; el TTL acotado cubre fallos de la invalidación.

RIESGOS
- Tenancy/PII: ninguno directo; la clave de caché ya incluye cookies. Nunca cachear respuestas de `/servicios`/admin: no debe cambiar su comportamiento (revisar que el override de headers solo afecte HTML estático).
- Permisos: ampliar el rol CI (hoy mínimo) o el de la Lambda; limitar al ARN de la distribución y la acción `cloudfront:CreateInvalidation`.
- Concurrencia/idempotencia: invalidaciones simultáneas (deploy + revalidate); límite de 3000 paths en curso; usar CallerReference único.
- Ventana entre deploy y propagación (~1-2 min); smoke debería correrse después y chequear que el HTML servido corresponde al build.
- 0029 R3 depende de que no sirva HTML viejo: esta feature es prerrequisito.
- Los chunks viejos persisten (prune:false): HTML viejo sigue funcionando salvo Server Actions.

COSTO
- CloudFront: primeras 1000 rutas de invalidación/mes gratis, luego 0,005 USD por ruta; `/*` cuenta como 1 ruta. Un deploy = 1 ruta: insignificante. Revalidate nativo envía 2 rutas por invalidación (`/x` y `/x?_rsc=*`). Opción TTL: costo en invocaciones Lambda (cuantificar tráfico). Confirmar precios vigentes.

INSUMOS FALTANTES
- Decisión de producto/ops: frescura tolerable del HTML (TTL máximo aceptable) y si /api/revalidate debe reflejarse al instante. No bloquea la exploración; sí el diseño.
- Id de la distribución/ARN como dato accesible para el CI (output de stack o constante): no bloquea.
- Confirmar con una llamada de solo lectura (aws cloudfront get-distribution-config, get-cache-policy) la política desplegada real; la CachePolicy activa es `d6ae2d8a-6127-430f-8eb6-2662c63c73b0`; no se leyó su contenido completo.

DUDAS ABIERTAS
- ¿`revalidatePath("/")` dispara `cdnInvalidationHandler` en OpenNext 4.1.8 + Next 16.4? (cache.js L336/L416)
- ¿Está `@aws-sdk/client-cloudfront` en el bundle del server y alcanzable desde la VPC (sin NAT)?
- ¿Se invalida `/*` o solo las 4 rutas HTML (+ `?_rsc=*` y variantes por Accept/RSC)? Dado que la clave incluye cookies/accept, la invalidación por ruta cubre todas las variantes.
- ¿Existe ADR que fije el TTL? ADR-0012 solo cubre OAC; no hay ADR de caché CDN (decide el proposer si hace falta uno).
