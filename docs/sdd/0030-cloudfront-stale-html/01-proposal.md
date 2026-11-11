# 0030 cloudfront-stale-html — proposal

RESUMEN
- Hay dos problemas distintos. (1) **Deploy**: el HTML que sigue en CloudFront es de un build anterior, así que sus ids de Server Action ya no existen (409) y no trae el interceptor de 0029 (con R3 eso sería un 403). Esto bloquea R3. (2) **Revalidación**: `revalidatePath("/")` regenera el HTML del **mismo build**, así que no causa ni 409 ni 403. Solo deja viejo el sello "Actualizado" del home hasta 1 año. No bloquea R3, pero el objetivo lo incluye.
- Propuesta: invalidar `/*` dentro del propio `cdk deploy` (custom resource de CloudFormation, sin tocar el rol de CI) y bajar `maxTtl` de `ServerCachePolicy` a unos pocos minutos para la revalidación. No hay infra nueva y el costo queda en ~0.

DUDAS DEL EXPLORER, RESUELTAS O ACOTADAS (verificado en node_modules)
- `revalidatePath("/")` (Next 16, `revalidate.js` L79-98) emite los tags `_N_T_/` y `_N_T_/index` y los pasa a `revalidateTag` de OpenNext. Con `tagCache` dynamodb en modo `"original"` (`dynamodb.js` L31) entra en la rama L353-427, que **sí** llama a `cdnInvalidationHandler.invalidatePaths`, pero solo si la tabla de tags tiene filas para ese tag. La ruta sale de `getPathFromRouteCacheKey` (prefijo removido) y para el home podría quedar como `/index` en lugar de `/`. En ese caso se invalidaría la ruta equivocada. **No confirmado**: requiere una prueba real.
- Bundle: `@aws-sdk/client-cloudfront@3.984.0` es dependencia directa de `@opennextjs/aws@4.1.8`. Es probable que esbuild lo empaquete si se elige el override `cloudfront`; falta verificarlo en `.open-next/server-functions/default`.
- VPC: el server Lambda corre en las subredes privadas importadas de Blockealo. Según ADR-0010 esa VPC tiene NAT y hoy el Lambda ya llega a Cognito, SQS y Secrets Manager. La API de CloudFront es global, así que solo se alcanza vía NAT. Es probable que funcione; no se verificó.
- Id de la distribución en CI: ya está en `cdk-outputs.json` (`CloudFrontDistributionId`, `evzla-stack.ts` L200). Para IAM en `ci-stack.ts` (otro stack) habría que poner el ARN fijo o `distribution/*`.
- Dependencia circular: es real si `serverFunction.environment` referencia `distribution.distributionId`, porque Distribution → FunctionUrl → Function → Distribution. Solo se rompe con un id constante (riesgo de drift si la distribución se reemplaza) o leyéndolo en runtime (SSM: más I/O y más permisos).
- `/*` o rutas puntuales: `/*` cuenta como 1 ruta (gratis), cubre las variantes por cookie/accept/rsc/querystring y también los assets sin versionar de S3 (con `s-maxage=31536000`). Las rutas puntuales cuestan más y hay que mantener la lista a mano.
- Límite de CloudFront: máximo 15 invalidaciones con comodín en curso. El override nativo envía `/x?_rsc=*` en cada `revalidatePath`, y hay 3 call-sites de `revalidatePath("/")` (route, `ingesta.ts`, `voz.ts`) que se disparan con cada carga. En un pico de cargas fallaría con `TooManyInvalidationsInProgress`.

EJE 1 — INVALIDACIÓN EN DEPLOY (requisito de R3)
A1. Custom resource en CloudFormation (recomendado)
- Qué es: invalidar `/*` desde el stack, ya sea con `BucketDeployment` (`distribution` + `distributionPaths:["/*"]`, que espera a que termine la invalidación) o con un `AwsCustomResource` dedicado cuya propiedad sea el BUILD_ID. Debe tener `addDependency(serverFunction)` para que la invalidación ocurra después de actualizar el código.
- Pros: el rol de CI sigue con solo `sts:AssumeRole`, así que ADR-0011 queda intacto. El handler de CDK está fuera de la VPC y llega a CloudFront sin depender del NAT. Si la invalidación falla, CloudFormation hace rollback. Corre en cualquier deploy (CI o manual con `cdk deploy`). El smoke corre con la invalidación ya completa.
- Contras: el deploy tarda 1-5 min más. Si se usa `CacheSeed`, solo invalida cuando cambia el contenido del seed (si el HTML no cambia, no hace falta). `CacheSeed` es condicional (`output.cacheDir`) y `deployAssets` corre hoy antes de crear la distribución: el designer debe resolver el orden.
- Adopción: unas 15 líneas de CDK y tests de assertion. Salida: borrar el construct; no deja estado.
- Invariantes: no toca PII, `sensitive` ni los RPC. El nuevo permiso `cloudfront:CreateInvalidation` lo recibe el rol del handler de CDK; hay que verificar si CDK lo acota al ARN o usa `*`.
A2. Paso en el workflow
- Qué es: después de `cdk deploy`, ejecutar `aws cloudfront create-invalidation --paths "/*"` y luego `wait invalidation-completed` con el id de `cdk-outputs.json`. Requiere sumar `cloudfront:CreateInvalidation`/`GetInvalidation` al rol `evzla-github-deploy`.
- Pros: es explícito y visible en el log de Actions; no toca el stack de la app.
- Contras: amplía el rol de CI y por lo tanto enmienda ADR-0011. Un `cdk deploy` manual no invalida. El ARN fijo en `ci-stack.ts` puede quedar desfasado. Hay que ajustar `ci-stack.test.ts` y `ci-workflow.test.ts`.
- Adopción: un paso o script con su test, más IAM. Salida: quitar el paso y el permiso.

EJE 2 — FRESCURA TRAS REVALIDACIÓN
B1. `maxTtl` acotado en `ServerCachePolicy` (recomendado; valor sugerido: 300 s)
- CloudFront recorta el `s-maxage=31536000` de OpenNext al `maxTtl`. Las rutas dinámicas (`/servicios`, admin, `/api`) ya salen como no-store, así que no cambian. El cambio solo reduce el cacheo y nunca lo aumenta, por lo que no hay riesgo de privacidad.
- Pros: es una sola propiedad, sin permisos, sin VPC y sin dependencia circular. Además acota cualquier fallo del Eje 1 a como máximo `maxTtl`.
- Contras: el sello "Actualizado" puede tardar hasta `maxTtl` en verse. Hay una invocación del Lambda (lectura del cache bucket en S3, sin RDS) por POP × variante × ruta × ventana. Con el tráfico actual es ~0 y queda dentro del free tier. El comentario de `page.tsx` ("Cero invocations") deja de ser literal.
- Adopción: una línea y un test. Salida: volver a 365 d (es un update, no un replace).
B2. Override nativo `cdnInvalidation: "cloudfront"`
- Pros: el home se ve fresco al instante después de cada carga.
- Contras: depende de los 5 puntos sin confirmar de arriba (ruta `/index`, bundle, NAT, ciclo, límite de 15 comodines). Además da permisos de CloudFront al Lambda público y suma ruido de error en los picos de carga.
- Adopción: config, env, IAM y prueba real. Salida: quitar el override.

CONDICIONES BLOQUEANTES
- C1. La invalidación ocurre después del update del server Lambda en el mismo deploy. Si ocurre antes, CloudFront vuelve a cachear HTML viejo por `maxTtl`. Responsable: designer, con un test `DependsOn`. Fallback: A2, que corre después de que termina todo el stack.
- C2. La invalidación corre en todo deploy donde cambia el HTML. Responsable: designer (usar el BUILD_ID o el hash del seed como propiedad). Fallback: usar como propiedad un hash del bundle completo.
- C3. El HTML expone un identificador del build (`buildId`/`deploymentId` en el payload, o el hash de un chunk) que el smoke pueda comparar contra `.open-next`. Responsable: spec-writer y designer, que deben verificarlo en el bundle. Fallback: comparar una ruta de chunk sacada del build manifest.
- C4 (solo si se elige B2): confirmar NAT, bundle y la ruta del home, más un id constante con su check de drift en CI. Fallback: B1.

PRUEBAS
- CDK (`infra/test/evzla-stack.test.ts`): el custom resource tiene `DistributionId` y `DistributionPaths:["/*"]` (o los parámetros del SDK); `DependsOn` incluye `ServerFunction`; existe la policy `cloudfront:CreateInvalidation`; `ServerCachePolicy.MaxTTL == 300`. Los tests de behaviors y de clave de caché no deben cambiar.
- `infra/test/ci-stack.test.ts`: sin cambios con A1; esto prueba que ADR-0011 se mantiene. Con A2: el nuevo statement acotado.
- Workflow y scripts (`ci-workflow.test.ts`, `ci-scripts.test.ts`): el smoke pasa a verificar el build id en `/`, `/buscar`, `/confianza` y `/emergencias`, sin tocar el buscador ni `/api`, para no escribir en `search_log`.
- Check real post-deploy: el smoke de CI con build id, más una prueba manual una sola vez: abrir `/` en una sesión limpia, ejecutar un Server Action sin 409 y confirmar que se carga el chunk del interceptor. Para B1: llamar a `POST /api/revalidate` y ver el sello nuevo en ≤ `maxTtl`.

RECOMENDACIÓN — A1 + B1
1. Resuelve el requisito de R3 sin ampliar el rol de CI (ADR-0011) ni dar permisos de CloudFront al Lambda expuesto.
2. Evita los 5 riesgos sin verificar del override nativo, entre ellos la posible invalidación de `/index` en vez de `/`.
3. Si la invalidación falla, CloudFormation hace rollback y no queda un "deploy verde con HTML viejo".
4. B1 cubre la revalidación y además sirve de red de seguridad del Eje 1, con una sola propiedad reversible.
5. Costo ~0: 1 ruta de invalidación por deploy y unas pocas invocaciones extra por ventana de `maxTtl`.

ADR: PROPUESTO → `adr/0013-frescura-html-cloudfront.md` (el proyecto usa `adr/`, no `docs/adr/`). Se justifica porque fija un contrato de caché de la CDN (`maxTtl` del HTML), cambia el proceso de deploy y es precondición de R3 en ADR-0012. Si el humano elige A2, el ADR es obligatorio porque enmienda ADR-0011. No se redactó aquí, ya que el encargo era escribir solo este archivo; queda pendiente `/new-adr`.

CONDICIÓN PREVIA A 0029 R3
- Al menos un deploy a producción con A1 completado, el smoke en verde verificando el build id en las 4 rutas HTML y la prueba manual del Server Action sin 409 con el interceptor cargado. R3 solo se despliega después. Su propio deploy también invalida (C2).

DECISIONES MENORES TOMADAS (reversibles)
- Invalidar `/*` y no rutas puntuales.
- Valor inicial de `maxTtl`: 300 s. El humano puede cambiarlo; no se cambia `defaultTtl` ni `minTtl`.
- El smoke verifica el build id en lugar de agregar un script nuevo.

DUDAS ABIERTAS
- ¿Es aceptable que el sello "Actualizado" tarde hasta 5 min en verse? Si se necesita al instante, conviene B2, con su costo de verificación.
- ¿El build id de Next 16 es determinista entre builds idénticos? Afecta a C2.
- ¿CDK 2.x acota `cloudfront:CreateInvalidation` del handler de `BucketDeployment` al ARN o lo deja en `*`? Si queda en `*`, conviene preferir un `AwsCustomResource` con la policy acotada.
- Las pestañas ya abiertas con HTML viejo siguen recibiendo 409 hasta recargar. Queda fuera de alcance, porque el sitio todavía no está en uso.
