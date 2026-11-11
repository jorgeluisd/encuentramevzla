# 0030 cloudfront-stale-html — design

RESUMEN
- A1: un `AwsCustomResource` (`HtmlInvalidation`) dentro de `OpenNextSite` llama a `CloudFront.createInvalidation` con `/*`. Su propiedad depende del BUILD_ID y tiene `DependsOn` sobre la función server, las tres `BucketDeployment` y `TagCacheInit`. Su policy está acotada al ARN de la distribución.
- B1: `ServerCachePolicy.maxTtl` pasa de 365 d a 300 s. La clave de caché no cambia.
- Smoke: recibe la ruta de `.open-next/assets/BUILD_ID` y verifica `"b":"<id>"` en `/`, `/buscar`, `/confianza` y `/emergencias`. El rol de CI y el server Lambda no reciben permisos nuevos.
- ADR-0013 en estado PROPUESTO (`adr/0013-frescura-html-cloudfront.md`).

DUDAS DE LA SPEC, RESUELTAS
1. Build id en el HTML: sí. Es `\"b\":\"<BUILD_ID>\"` en el payload RSC y coincide con `assets/BUILD_ID` (verificado por el orquestador en prod).
2. No es determinista (no hay `generateBuildId`), así que cada build cambia la propiedad y re-invalida. Es lo que se busca (AC-3).
3. `BucketDeployment` en CDK 2.272.0 NO acota el permiso: `bucket-deployment.js` agrega `cloudfront:GetInvalidation` y `cloudfront:CreateInvalidation` con `resources:["*"]`. Además lo hace al rol del handler singleton, que comparten las tres `BucketDeployment`. Por eso se descarta y se usa `AwsCustomResource` con `fromStatements` acotado (AC-4).
4. Orden: `deployAssets` pasa a devolver los constructs. Las dependencias se agregan al final del constructor, después de crear la distribución. No hay ciclo: ni la distribución, ni la función, ni los deployments referencian al custom resource.

PIEZAS POR CAPA (solo infra y CI; dominio y aplicación sin cambios)
- `infra/lib/open-next-output.ts` · agrega `buildId: string` a `OpenNextOutput`. Lo lee de `<assetsDir>/BUILD_ID` con `confine`, hace trim y valida con `^[A-Za-z0-9_-]{1,64}$`. Si falta o no es válido, lanza un error con el nombre del campo y sin la ruta · imports: `node:fs` y `node:path` (ya presentes).
- `infra/lib/open-next-site.ts` · `maxTtl: Duration.seconds(300)`, `deployAssets(): Construct[]` y el custom resource `HtmlInvalidation` · imports: `aws-cdk-lib/custom-resources` e `iam` (ya presentes). Nada de `apps/web`.
- `infra/lib/evzla-stack.ts` · sin cambios. El output `CloudFrontDistributionId` se mantiene.
- `infra/scripts/ci/smoke.mjs` · un segundo argumento obligatorio (ruta del archivo BUILD_ID), los 3 checks HTML nuevos y la comparación del build id · imports: `node:fs/promises` y los ya usados.
- `.github/workflows/deploy-production.yml` · el paso Smoke pasa a `node infra/scripts/ci/smoke.mjs https://encuentramevzla.com apps/web/.open-next/assets/BUILD_ID`. No se agregan pasos.
- Tests: `infra/test/evzla-stack.test.ts`, `open-next-output.test.ts`, `ci-scripts.test.ts` (smoke) y `ci-workflow.test.ts` (constante `SMOKE`). `ci-stack.test.ts` queda sin cambios (AC-7). El fixture `test/fixtures/web/.open-next/assets/BUILD_ID` ya existe.

BORDE / INFRAESTRUCTURA — `HtmlInvalidation`
- `new cr.AwsCustomResource(this, "HtmlInvalidation", {...})`, con `onCreate` = `onUpdate` = `{ service: "CloudFront", action: "createInvalidation", parameters: { DistributionId: distribution.distributionId, InvalidationBatch: { CallerReference: \`evzla-${buildId}\`, Paths: { Quantity: 1, Items: ["/*"] } } }, physicalResourceId: PhysicalResourceId.fromResponse("Invalidation.Id") }`. Sin `onDelete`.
- `policy: AwsCustomResourcePolicy.fromStatements([{ actions: ["cloudfront:CreateInvalidation"], resources: [distribution.distributionArn] }])`. No se pide `GetInvalidation` porque no se espera el término.
- `installLatestAwsSdk: false`: usa el SDK v3 del runtime, sin `npm install` en runtime ni dependencia de internet. Se le pasa `logGroup` propio (`HtmlInvalidationLogs`, con la retención del sitio). Corre fuera de la VPC.
- Dependencias explícitas: `node.addDependency(serverFunction, ...assetDeployments, tagCacheInit?)`. La referencia a `distributionId` agrega la dependencia de la distribución.
- `CallerReference` = BUILD_ID: con el mismo BUILD_ID y el mismo batch, CloudFront devuelve la invalidación existente (idempotente en reintentos y en rollback).
- Espera: no se espera a que la invalidación se complete. La llamada vuelve en segundos, muy por debajo del timeout de 2 min del handler y de la hora de CFN. La propagación (~1-2 min, a veces más) la absorbe el smoke con reintentos. Se descartó `cr.Provider` con `isComplete` porque requiere un handler propio que hay que mantener y probar.
- Fallo: si `createInvalidation` lanza un error (`TooManyInvalidationsInProgress`, `AccessDenied`), falla el recurso, CFN hace `UPDATE_ROLLBACK` y `cdk deploy` falla antes del smoke. En el rollback, CFN vuelve a llamar a `onUpdate` con el BUILD_ID anterior: es idempotente si CloudFront conserva el registro. Si también falla, ver el runbook.
- Ventana residual: entre la actualización del Lambda y un rollback, CloudFront puede cachear HTML del build nuevo durante ≤ 300 s, y ese HTML apunta a Server Actions que ya no existen. Está acotada por B1 y por la invalidación manual del runbook.

DATOS + PLAN DE MIGRACIÓN
- No aplica: no hay DDL, RLS ni backfill. `CachePolicy` se actualiza in place y no se reemplaza. No hay riesgo de lock.

EVENTOS Y JOBS
- Ninguno nuevo. `POST /api/revalidate`, la cola FIFO y `RevalidationFunction` quedan sin cambios. El sello del home llega a la CDN en ≤ 300 s.

SMOKE (contrato)
- `smoke.mjs <url> <build-id-file>`. Si falta el archivo, el id no cumple la regex o la URL no es válida, termina con `fail` y un mensaje fijo, sin la ruta del runner.
- `SMOKE_PATHS` = `/`, `/buscar`, `/confianza`, `/emergencias`, `/admin`, `/servicios`, `/__smoke-no-existe`. Todas son GET sin querystring. `/buscar` es estática (no lee `searchParams`) y no ejecuta búsqueda (AC-11).
- Check de build id (las 4 rutas HTML): status 200 y extracción con `/\\?"b\\?":\\?"([A-Za-z0-9_-]{1,64})\\?"/`. Los motivos posibles son `build id ausente` o `build id distinto`. Nunca se imprime el cuerpo del HTML ni el id servido (S-4). `/` conserva además el check del título.
- Reintentos: los checks de build id usan `BUILD_ID_ATTEMPTS = 18` × `SMOKE_RETRY_DELAY_MS` (≈ 3 min). El resto se queda en 5. Si la invalidación no se propagó, el smoke falla (AC-10).

COMPOSITION ROOT
- `infra/lib/app.ts` sin cambios: `readOpenNextOutput` ya alimenta a `OpenNextSite`. No hay tokens DI (es CDK).

TESTS POR AC (todos con el fixture)
- AC-1: exactamente un `Custom::AWS` cuyo `Create` contiene `"createInvalidation"`, `"Items":["/*"]` y `DistributionId` = Ref de la distribución. Ningún `BucketDeployment` lleva `DistributionId`.
- AC-2: `DependsOn` del CR incluye los logical ids de `ServerFunction`, `VersionedAssets`, `UnversionedAssets` y `CacheSeed` (si existe).
- AC-3: `Create` y `Update` contienen `evzla-<BUILD_ID del fixture>`. Con otro BUILD_ID en un fixture temporal, la propiedad cambia.
- AC-4: la policy del CR tiene exactamente `cloudfront:CreateInvalidation` sobre `distributionArn`. Ningún statement del stack combina `cloudfront:*` con `"*"`. `InstallLatestAwsSdk` = false.
- AC-5: `MaxTTL 300`, `DefaultTTL 0`, `MinTTL 0` y la clave idéntica. AC-6: los tests existentes no se tocan.
- AC-7: `ci-stack.test.ts` sin diff. AC-8: test del workflow (smoke después del deploy, con el argumento BUILD_ID, sin `cloudfront` en ningún `run:`).
- AC-9/10/11: el servidor local de `ci-scripts.test.ts` sirve `\"b\":\"<id>\"`. Se prueba el caso OK, el id distinto, el id ausente, que stderr no tenga `BODY_MARKER` y que `SMOKE_PATHS` sea exacto.
- S-2 (nuevo): el rol del server no tiene `cloudfront:` y su entorno no tiene `CLOUDFRONT_DISTRIBUTION_ID`.
- `open-next-output.test.ts` (nuevo): un BUILD_ID ausente, inválido (`a b`, `"`, > 64) o que sea symlink fuera de `.open-next` lanza error.

AMENAZAS (activo · actor · vector · mitigación · test)
| activo | actor | vector | mitigación | test |
|---|---|---|---|---|
| Disponibilidad de Server Actions (409/403 en R3) | deploy propio | HTML viejo en la CDN tras el deploy | CR `/*` después del Lambda y los assets, maxTtl 300 s | AC-1, AC-2, AC-3, AC-9 |
| Respuestas con sesión o admin | visitante | servirse en caché compartida | la clave sigue incluyendo todas las cookies; maxTtl solo reduce el cacheo | AC-5, AC-6, S-3 |
| Distribución (config) | handler CR comprometido | permisos amplios sobre CloudFront | solo `CreateInvalidation` sobre el ARN; se descarta `BucketDeployment` (`*`) | AC-4 |
| Rol CI `evzla-github-deploy` | atacante con OIDC de Production | escalar a CloudFront | rol sin cambios (ADR-0011) | AC-7, AC-8 |
| Server Lambda público | atacante vía la app | invalidaciones masivas (costo/DoS) | sin `cloudfront:*` ni el id en su entorno | S-2 (nuevo) |
| Plantilla CFN y logs del smoke | artefacto producido por código de terceros | BUILD_ID manipulado (inyección o ruta fuera) | `confine` y regex en el synth y en el smoke | open-next-output.test, ci-scripts |
| PII en logs de CI | lector de Actions | el smoke imprime HTML | solo ruta, status y motivo fijo | AC-10, S-4 |
| `search_log` | smoke | GET al buscador o a `/api` | lista exacta de rutas, sin querystring | AC-11 |
| Cadena de suministro del handler | registro npm | `installLatestAwsSdk` | `false` | AC-4 |
| Estado del stack | fallo en el rollback | `UPDATE_ROLLBACK_FAILED` por el CR | idempotencia del CallerReference y runbook `--resources-to-skip` | manual (runbook) |
| BUILD_ID | público | lectura | ya era público (`/BUILD_ID` en S3 y en el HTML); no es sensible | n/a |

ROLLBACK / FLAG
- Sin flag: el cambio es de infraestructura y se revierte con un deploy. Revertir la feature = quitar el CR y volver `maxTtl` a 365 d (update, sin estado). Mientras no se revierta, cada deploy de un SHA anterior genera un BUILD_ID nuevo y vuelve a invalidar.

RUNBOOK
- Invalidación manual (operador con credenciales propias, nunca el rol de CI). El id sale de `infra/cdk-outputs.json` → `CloudFrontDistributionId`:
  `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"` y luego
  `aws cloudfront wait invalidation-completed --distribution-id <ID> --id <INVALIDATION_ID>`.
- Deploy fallido por la invalidación: CFN revierte solo. Revisar `TooManyInvalidationsInProgress` con `aws cloudfront list-invalidations --distribution-id <ID>`, esperar y relanzar con `workflow_dispatch`.
- `UPDATE_ROLLBACK_FAILED` por el CR: `aws cloudformation continue-update-rollback --stack-name EvzlaStack --resources-to-skip <logicalId de HtmlInvalidation>` y después la invalidación manual.
- Volver a un release anterior: `workflow_dispatch` con el SHA (ADR-0011). Invalida por sí mismo.

SKILLS A CARGAR EN IMPLEMENTACIÓN
- `.claude/skills/testing-vitest.md`, `.claude/skills/privacy-and-security.md`, `.claude/skills/architecture.md` (infra fuera de core), `.claude/skills/git-commits.md`.

DUDAS ABIERTAS
1. Hay que confirmar que la regex del smoke coincide con el HTML real de `/buscar`, `/confianza` y `/emergencias` (solo se verificó `/`). Se verifica en M-3 y en el primer smoke.
2. El comentario "Cero invocations" de la página del home deja de ser literal con maxTtl 300 s. ¿Se ajusta en este PR? Es solo texto y no cambia el comportamiento.
3. Retención de `CallerReference` en CloudFront para la idempotencia del rollback: no está documentada. Si no se cumple, aplica el runbook.
