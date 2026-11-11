# 0030 cloudfront-stale-html — spec

RESUMEN
- Tras cada deploy, CloudFront sigue sirviendo HTML de un build anterior (`s-maxage` de 1 año). Se invalida `/*` dentro del `cdk deploy` (A1) y se acota `maxTtl` a 300 s (B1).
- Es precondición de 0029 R3. No toca PII, schema `sensitive`, RPC ni el rol de CI.

ESTADO: borrador (decisión humana 2026-11-11: A1 + B1; no-lista hasta resolver DUDAS ABIERTAS 1-2)

OBJETIVO · ACTORES
- Que ningún deploy deje HTML de un build viejo en la CDN, y que la obsolescencia por revalidación quede acotada a 300 s.
- Actores: pipeline de deploy (rol `evzla-github-deploy`, solo `sts:AssumeRole`), CloudFormation/CDK (ejecuta la invalidación), visitante anónimo (consume HTML). Sin roles de aplicación.

CRITERIOS DE ACEPTACIÓN
Infra (CDK assertions, `infra/test/evzla-stack.test.ts`):
- AC-1  Given el stack sintetizado When se inspecciona Then existe exactamente un recurso que invalida la distribución de `EvzlaStack` con `DistributionId` = Ref de esa distribución y rutas `["/*"]`, y no existen invalidaciones de rutas puntuales.
- AC-2  Given el recurso de AC-1 When se inspecta Then depende (`DependsOn`, directo o transitivo) de la función server (`ServerFunction`) y de la distribución, de modo que corre después de actualizar el código.
- AC-3  Given el recurso de AC-1 When se inspecta Then una propiedad cambia con cada build (BUILD_ID o hash del contenido de `.open-next`), de modo que CloudFormation lo re-ejecuta en todo deploy donde cambia el HTML.
- AC-4  Given el stack When se inspecta la política del handler de invalidación Then solo concede `cloudfront:CreateInvalidation` (y `GetInvalidation` si se espera el término); si el recurso es `*`, un test lo documenta y se registra en el ADR (ver DUDAS 3). Preferido: acotado al ARN de la distribución.
- AC-5  Given `ServerCachePolicy` When se inspecta Then `MaxTTL == 300`, `DefaultTTL == 0`, `MinTTL == 0`; la clave de caché (cookies, querystrings, headers accept/rsc/next-*/x-prerender-revalidate) queda idéntica.
- AC-6  Given los tests existentes de behaviors, clave de caché sin token/body hash y sin access logs When corre la suite Then pasan sin modificación.
CI:
- AC-7  Given `infra/test/ci-stack.test.ts` sin cambios When corre Then pasa y la única política del rol `evzla-github-deploy` sigue siendo `sts:AssumeRole` sobre los roles de bootstrap (ADR-0011 intacto).
- AC-8  Given el workflow `deploy-production.yml` When se parsea Then el smoke corre después de `cdk deploy`, recibe el build id esperado (de `.open-next` o del artefacto del build) y no se agregan pasos con permisos de CloudFront.
Smoke (`ci-scripts.test.ts` + script de smoke):
- AC-9  Given un build id esperado y un fetch simulado When el HTML de `/`, `/buscar`, `/confianza` y `/emergencias` contiene ese id Then el smoke termina con código 0.
- AC-10 Given que una de las 4 rutas devuelve un id distinto o ninguno When corre el smoke Then termina con código ≠ 0 e indica la ruta, sin imprimir el cuerpo del HTML.
- AC-11 Given el smoke When se inspecciona Then solo hace GET de esas 4 rutas (sin `/api/*`, sin buscador), para no escribir en `search_log`.

CASOS BORDE
- AC-1/3: deploy sin cambio de HTML pero con nuevo BUILD_ID → invalida igual (costo: 1 ruta). Deploy idéntico (mismo valor de propiedad) → CloudFormation no re-ejecuta; aceptable porque el HTML no cambió. Depende de DUDAS 2.
- AC-2: si la invalidación fallara antes del update del Lambda, CloudFront recachearía HTML viejo hasta 300 s; por eso el orden es obligatorio.
- Invalidación fallida (p. ej. `TooManyInvalidationsInProgress`) → el recurso falla, CloudFormation hace rollback del stack y el workflow falla antes del smoke. No queda "deploy verde con HTML viejo".
- Rollback: tras revertir, el siguiente deploy re-invalida; mientras tanto `maxTtl` de 300 s acota la obsolescencia.
- Rutas dinámicas (`/servicios`, `/servicios/editar/[token]`, `/admin/*`, `/api/*`) siguen sin cacheo en CDN: `maxTtl` solo reduce cacheo, no lo aumenta.
- Deploy manual (`cdk deploy` local) también invalida, al ser parte del stack.
- Concurrencia: dos deploys simultáneos los serializa CloudFormation; el límite de invalidaciones con comodín en curso se cubre con el rollback anterior.
- Pestañas abiertas con HTML viejo siguen con 409 hasta recargar (fuera de alcance).

SEGURIDAD (escenarios negativos)
- S-1  Given el rol `evzla-github-deploy` When se inspecciona Then no tiene `cloudfront:*` (AC-7).
- S-2  Given el rol de ejecución del server Lambda When se inspecciona Then no tiene `cloudfront:*` ni `CLOUDFRONT_DISTRIBUTION_ID` en su entorno.
- S-3  Given una ruta con cookie de sesión o `/servicios/editar/[token]` When se consulta tras el cambio Then su respuesta no se cachea compartida (sin regresión de `Cache-Control`/clave de caché; AC-5, AC-6).
- S-4  Given el smoke y los logs del workflow When se revisan Then no contienen cuerpos HTML, tokens ni términos de búsqueda; solo ruta e id de build.

CONTRATOS
- HTTP: sin endpoints nuevos ni cambios en `POST /api/revalidate` (sigue regenerando en origen; el sello "Actualizado" llega a la CDN en ≤ 300 s).
- Infra: invalidación `/*` en CloudFormation (BucketDeployment con `distributionPaths` o `AwsCustomResource`; elige el designer) con el orden de AC-2. Salida de stack `CloudFrontDistributionId` se mantiene.
- Smoke: `smoke.mjs <url>` recibe además el build id esperado. Sin eventos ni jobs nuevos.

CONSISTENCIA
- Inmediato: tras `cdk deploy` exitoso la invalidación `/*` está completa (si se espera su término) antes del smoke.
- Eventual: la revalidación on-demand del home se refleja en CDN en ≤ 300 s (aceptado por el humano). Propagación de la invalidación: ~1-2 min si no se espera.

VERIFICACIÓN MANUAL POST-DEPLOY (una vez, producción)
- M-1  En sesión limpia abrir `/`; ejecutar un Server Action: responde sin 409.
- M-2  La pestaña Network muestra el chunk del interceptor de 0029 cargado.
- M-3  `curl -sI https://encuentramevzla.com/` justo tras el deploy: `age` reiniciado (cercano a 0), no el de antes del deploy; luego `age` ≤ 300.
- M-4  `POST /api/revalidate` y confirmar el sello "Actualizado" nuevo en ≤ 300 s.

PRECONDICIÓN PARA 0029 R3
- Al menos un deploy a producción con esta feature completado, AC-9 en verde (smoke con build id en las 4 rutas) y M-1 a M-3 confirmados. R3 se despliega solo después; su propio deploy también invalida.

FUERA DE ALCANCE
- Override nativo `cdnInvalidation: "cloudfront"` de OpenNext; cambios al rol CI; OAC/interceptor de 0029; runtime nodejs; canary; telemetría; invalidación de pestañas ya abiertas; invalidación por ruta. ADR-0013 pendiente (`/new-adr`).

DUDAS ABIERTAS
1. C3: ¿el HTML expone un build id comparable (`buildId`/`deploymentId` o hash de chunk)? Sin esto AC-9/AC-10 no se pueden implementar; fallback: ruta de chunk del build manifest. Debe verificarlo el designer en el bundle.
2. ¿El build id de Next 16 es determinista entre builds idénticos? Define si AC-3 usa BUILD_ID o hash del contenido.
3. ¿CDK acota `cloudfront:CreateInvalidation` al ARN de la distribución en BucketDeployment? Si no, preferir `AwsCustomResource` con policy acotada (AC-4).
4. `CacheSeed` es condicional y `deployAssets` corre antes de crear la distribución: el orden lo resuelve el designer sin violar AC-2.
