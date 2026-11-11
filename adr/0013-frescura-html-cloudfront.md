# ADR-0013 — Frescura del HTML en CloudFront: invalidación `/*` en el deploy y `maxTtl` de 300 s

Fecha: 2026-11-11 · Estado: **PROPUESTO** · Complementa: [ADR-0010](./0010-migracion-supabase-vercel-a-aws.md), [ADR-0011](./0011-ci-cd-github-actions-oidc.md) y [ADR-0012](./0012-function-url-aws-iam-oac.md) (precondición de R3) · Feature: [`docs/sdd/0030-cloudfront-stale-html/`](../docs/sdd/0030-cloudfront-stale-html/01-proposal.md).

## Contexto

OpenNext fuerza `s-maxage=31536000` en las páginas HTML prerenderizadas (`/`, `/confianza`, `/emergencias`).
`ServerCachePolicy` acepta hasta 365 días, así que CloudFront guarda ese HTML hasta un año. Ningún paso del deploy ni de la
revalidación invalida la CDN. Por eso, después de cada deploy el HTML servido es de un build anterior: sus ids de Server
Action ya no existen (409) y no trae el interceptor de ADR-0012. Con R3 eso se convertiría en un 403. Además,
`revalidatePath("/")` regenera el HTML solo en el origen, y el sello "Actualizado" del home puede quedar viejo hasta un año.

El rol de CI tiene como única política `sts:AssumeRole` sobre los roles de bootstrap (ADR-0011). El server Lambda es público
y corre en la VPC compartida. `BucketDeployment` de CDK 2.272.0 concede `cloudfront:CreateInvalidation` y `GetInvalidation`
sobre `*` al rol del handler que comparten todos los deployments del stack.

## Decisión

1. El stack invalida `/*` en cada deploy con un `AwsCustomResource` (`createInvalidation`). Su policy concede solo
   `cloudfront:CreateInvalidation` sobre el ARN de la distribución, y se configura con `installLatestAwsSdk: false`.
2. El recurso depende de la función server, de los `BucketDeployment` de assets y caché y de la siembra de tags. Así corre
   después de que el código y la caché del build nuevo están en su lugar.
3. Su propiedad incluye el BUILD_ID de Next (aleatorio por build), que además se usa como `CallerReference`. Todo deploy
   de un build nuevo re-invalida. Un rollback o un "Re-run failed jobs" del mismo artefacto reutiliza el BUILD_ID y no
   re-invalida: esa ventana la acota el `maxTtl` de 300 s. No se espera a que la invalidación se complete.
4. `ServerCachePolicy.maxTtl` pasa a 300 s. `defaultTtl`, `minTtl` y la clave de caché no cambian. Esto acota la
   obsolescencia del HTML tras una revalidación y cubre un fallo de la invalidación.
5. El smoke de CI compara el BUILD_ID del artefacto con el que trae el HTML de las 3 rutas (`/`, `/confianza`,
   `/emergencias`), pedidas con el `Accept` de un navegador porque `accept` está en la clave de caché. Mientras sirve un
   build distinto reintenta hasta 18 veces (unos 3 minutos); los demás fallos tienen un presupuesto aparte de 5. Nunca
   imprime el HTML ni el id servido.
6. No cambian el rol de CI, el rol del server Lambda ni `POST /api/revalidate`. No se activa el override
   `cdnInvalidation: "cloudfront"` de OpenNext.

## Consecuencias

- (+) Ningún deploy deja HTML de un build anterior en la CDN. Se cumple la precondición de R3 de ADR-0012.
- (+) Si la invalidación falla, CloudFormation hace rollback: no queda un deploy verde con HTML viejo.
- (+) También invalida un `cdk deploy` manual. ADR-0011 queda intacto.
- (+) Costo ~0: una ruta de invalidación por deploy.
- (−) El sello "Actualizado" puede tardar hasta 300 s en verse tras una carga.
- (−) Hay invocaciones del server Lambda por POP, variante y ruta en cada ventana de 300 s. Con el tráfico actual queda en
  el free tier. El home deja de ser "cero invocations".
- (−) La propagación no se espera en CloudFormation. Si tarda más que los reintentos, el smoke falla aunque el stack esté bien.
- (−) **Riesgo residual:** si un deploy falla después de actualizar el Lambda, CloudFront puede cachear HTML del build
  revertido durante ≤ 300 s. Si el rollback también falla en el recurso, el stack queda en `UPDATE_ROLLBACK_FAILED`.
  Mitigación: `continue-update-rollback --resources-to-skip` e invalidación manual. Estos pasos quedan documentados en el
  runbook de `03-design.md` pero **no ensayados**.
- (−) Las pestañas abiertas antes del deploy siguen con HTML viejo hasta recargar.

## Alternativas consideradas

- `BucketDeployment` con `distribution` y `distributionPaths`: concede `cloudfront:*Invalidation` sobre `*` al handler
  compartido.
- Paso `aws cloudfront create-invalidation` en el workflow: amplía el rol de CI (enmienda ADR-0011) y no cubre un
  `cdk deploy` manual.
- Override nativo `cdnInvalidation: "cloudfront"` de OpenNext: da permisos de CloudFront al Lambda público, depende del NAT,
  de una ruta del home no confirmada (`/index`), de un id fijo para evitar el ciclo en CDK y del límite de 15 invalidaciones
  con comodín en curso.
- Solo bajar `maxTtl`: deja hasta 300 s de HTML viejo en cada deploy, lo que no basta para R3.
- `cr.Provider` con `isComplete` para esperar la invalidación: requiere un handler propio, que suma código y tests.
