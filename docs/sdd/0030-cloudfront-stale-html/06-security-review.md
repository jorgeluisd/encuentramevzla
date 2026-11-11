# 0030 cloudfront-stale-html: revisión de seguridad

Diff revisado: `59b4b63..HEAD` (rama `fix/0030-cloudfront-stale-html`). Revisión de solo lectura: sin llamadas a AWS ni `cdk diff`.
Contexto: `02-spec.md` (S-1..S-4), `03-design.md` (AMENAZAS), ADR-0013, ADR-0011, condición de 0029 (sin logs de CloudFront con headers).

RESUMEN: 3 hallazgos (crítico 0 / alto 0 / medio 0 / bajo 3) + 4 observaciones informativas · riesgo residual: aceptable

| Sev | Hallazgo | Archivo:línea | Vector | Mitigación requerida | Test que falta |
|---|---|---|---|---|---|
| Bajo | Rollback tras invalidar: si el deploy falla después de `HtmlInvalidation`, CFN re-ejecuta `onUpdate` con el `CallerReference` del build anterior. CloudFront devuelve la invalidación vieja (ya completada) y no invalida de nuevo. Las edges que ya cachearon HTML del build nuevo lo sirven contra el Lambda viejo hasta 300 s, lo que da 409/403 en Server Actions. Es un problema de disponibilidad, no de confidencialidad. | `infra/lib/open-next-site.ts:282` | fallo propio del deploy | Aceptar: el TTL de 300 s lo acota, y el runbook del diseño (invalidación manual) cubre el caso. Está documentado en DUDAS 3. | Ninguno automatizable; queda como prueba manual del runbook. |
| Bajo | El rol del handler singleton recibe, además de la política acotada, la managed policy `AWSLambdaBasicExecutionRole` (`logs:CreateLogGroup/CreateLogStream/PutLogEvents` sobre `*`). Es el patrón estándar de CDK y no da acceso a CloudFront ni a datos, pero no llega a "nada en `*`" en sentido literal. | `infra/lib/open-next-site.ts:286-297` (rol generado por `AwsCustomResource`) | handler comprometido que escribe en otros log groups | Aceptar como estándar, o fijar un `role` propio limitado al ARN de `HtmlInvalidationLogs` (backlog). | Si se acota: aserción de que el rol del handler no tiene managed policies con `Resource: "*"`. |
| Bajo (latente) | `AwsCustomResource` usa una Lambda singleton por stack (UUID `679f53fa-…`). Cada `AwsCustomResource` futuro del `EvzlaStack` agregaría su política al mismo rol, y ese rol ya tiene `cloudfront:CreateInvalidation`. Hoy hay un único `Custom::AWS`, así que nada se comparte. `TagCacheInit` (`cr.Provider`) y `BucketDeployment` usan roles distintos. | `infra/lib/open-next-site.ts:286` | cambio futuro que agregue otro CR y amplíe permisos sin advertirlo | Ya mitigado: `invalidation()` en `evzla-stack.test.ts` exige exactamente un `Custom::AWS`, y un segundo CR rompe el test. Hay que mantener esa aserción y no relajarla sin revisar el rol. | Ninguno (cubierto). |

Observaciones informativas (sin severidad)
- I-1 · TTL 300 s y costo/abuso (`open-next-site.ts:195`). Bajar `maxTtl` no abre un vector nuevo. La clave de caché ya incluye todas las querystrings y cookies, así que cualquiera podía saltarse la caché con `?x=<aleatorio>` antes de este cambio. El aumento legítimo de invocaciones está acotado a (edges activas × claves HTML) / 300 s. El HTML `force-static` sale del caché S3 de OpenNext, sin consulta a la base. `MinTTL`/`DefaultTTL` 0 y la clave quedan intactos (tests AC-5/S-3), y solo baja el tiempo de cacheo compartido. La protección de costo sigue siendo el presupuesto de USD 5 (`evzla-stack.ts:181`). No hay WAF, rate limit en CloudFront ni `reservedConcurrentExecutions` en el server; eso es preexistente y queda fuera de este diff (ver riesgo residual).
- I-2 · Inyección por build id: no se encontró. En el synth, `readBuildId` lee a través de `confine` (rechaza symlinks fuera de `.open-next`), aplica `trim` y valida contra `^[A-Za-z0-9_-]{1,64}$`. El `$` de JS no acepta un salto de línea final. El error tiene texto fijo y no expone la ruta (`open-next-output.ts:53,61-70,91`). En el smoke, la misma regex (`smoke.mjs:229,240-247`). En el workflow, el argumento es una ruta literal sin `${{ }}` en `run` (`deploy-production.yml:165`). `CallerReference = evzla-<id>` usa caracteres inertes. El build id ya era público (HTML y `/BUILD_ID`).
- I-3 · El smoke lee `BUILD_ID` con `readFile` sin `confine`, así que sigue symlinks (`smoke.mjs:240-247`). Sin impacto: el contenido nunca se imprime, solo se compara, y un valor que no pasa la regex termina con un mensaje fijo. `check-bundle.mjs` ya escanea el árbol movido antes de usarlo.
- I-4 · Fuera del alcance de seguridad (para el verifier): `apps/web/app/buscar/page.tsx` hace `redirect("/")`, no es una página estática con contenido como dice `03-design.md:41`. Como el smoke usa `redirect: "manual"` y exige 200, `/buscar` falla si responde 307. `04-plan.md:23` dice que se verificó en prod. Si no fuera así, el smoke falla cerrado. No tiene impacto de privacidad: no ejecuta búsqueda ni escribe en `search_log`.

Verificaciones solicitadas
- Política del CR: un solo statement, `cloudfront:CreateInvalidation` sobre el ARN de esta distribución (`open-next-site.ts:289-294`). Tiene test exacto (AC-4). Ningún `cloudfront:*` sobre `*` en el stack (test). `installLatestAwsSdk: false`, así que no hay `npm install` en runtime. No tiene `onDelete`. El handler corre fuera de la VPC y no alcanza RDS.
- Rol de CI `evzla-github-deploy`: `infra/lib/ci-stack.ts` no aparece en el diff y sigue con solo `sts:AssumeRole` sobre los roles de bootstrap. El workflow no tiene ningún paso que llame a CloudFront (test AC-8). Se cumple S-1.
- Server Lambda: sin `cloudfront:` y sin `CLOUDFRONT_DISTRIBUTION_ID` (test S-2).
- Smoke y PII (S-4): stderr solo muestra la ruta, el status, el número de intento y motivos fijos (`título ausente`, `build id ausente`, `build id distinto`, `texto ausente`). No imprime el cuerpo ni el id servido (`smoke.mjs:333-336`), y tiene test con `BODY_MARKER`. Las rutas son GET sin querystring, sin `/api` y sin término de búsqueda (AC-11).
- Logs del handler: `Logging.all()` por defecto registra los parámetros y la respuesta de `CreateInvalidation` (id de distribución, `CallerReference` con el build id público, id de la invalidación). No incluyen PII ni secretos. Usa un log group propio `HtmlInvalidationLogs` con 30 días de retención (test).
- Condición de 0029: el diff no activa logs de acceso ni logs en tiempo real de CloudFront, y el test existente "sin access logs" (AC-6) se mantiene sin cambios.
- Dependencias nuevas: ninguna (`aws-cdk-lib/custom-resources` ya estaba en `aws-cdk-lib` 2.272.0).

AMENAZAS DEL DISEÑO (03-design.md)
| Amenaza | Implementada | Test |
|---|---|---|
| HTML viejo en la CDN tras el deploy | sí (CR `/*` con `DependsOn` en server/assets/seed/tag cache; `maxTtl` 300) | sí (AC-1, AC-2, AC-3, AC-5; AC-9 en smoke) |
| Respuestas con sesión cacheadas compartidas | sí (clave idéntica, solo baja el TTL) | sí (AC-5, S-3, AC-6) |
| Handler CR con permisos amplios sobre CloudFront | sí | sí (AC-4, sin `cloudfront:*` en `*`) |
| Escalada del rol CI a CloudFront | sí (sin cambios) | sí (AC-7/AC-8) |
| Server Lambda dispara invalidaciones | sí | sí (S-2) |
| BUILD_ID manipulado (inyección/ruta fuera) | sí (confine + regex en synth; regex en smoke) | sí (open-next-output.test, ci-scripts) |
| PII en logs de CI | sí | sí (AC-10, S-4) |
| `search_log` por el smoke | sí | sí (AC-11) |
| Cadena de suministro del handler | sí (`installLatestAwsSdk: false`) | sí (AC-4) |
| `UPDATE_ROLLBACK_FAILED` por el CR | parcial (idempotencia por `CallerReference` + runbook) | no (manual; ver hallazgo bajo 1) |
| BUILD_ID público | n/a (no sensible) | n/a |

RIESGO RESIDUAL
- Ningún test ni control cubre el rollback del CR ni la retención real del `CallerReference` en CloudFront (DUDAS 3). Es aceptable: el impacto es de disponibilidad, dura como máximo 300 s y existe runbook manual.
- No hay control de abuso de costo en el origen (sin WAF, rate limit ni concurrencia reservada). Es preexistente: la ruptura de caché por querystring ya era posible y este diff no lo empeora de forma material. Lo cubre solo la alerta de presupuesto. Se recomienda llevarlo al backlog fuera de 0030.
- La managed policy de logs sobre `*` del handler es estándar de CDK. Es aceptable salvo que el humano pida un rol propio (backlog).
- Nada de lo anterior bloquea el GATE 2. La aceptación de los tres hallazgos bajos queda para el humano en `gates.md`.
