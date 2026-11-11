# 0030 cloudfront-stale-html — code review

Diff `59b4b63..HEAD` (rama `fix/0030-cloudfront-stale-html`). Revisión de solo lectura: sin AWS y sin cambios en el código.

RESUMEN: 9 hallazgos (1 alta / 2 media / 6 baja) · veredicto: CAMBIOS

| Sev | Archivo:línea | Hallazgo · escenario de falla | Regla | Qué se espera |
|---|---|---|---|---|
| Alta | infra/scripts/ci/smoke.mjs:108 | El smoke pide el HTML con el `accept: */*` de undici. `accept` está en la clave de caché (`ServerCachePolicy`), así que el smoke lee una variante distinta de la que reciben los navegadores (`text/html,...`). Con `maxTtl` 300 s, la variante `*/*` que cacheó el smoke anterior ya expiró cuando llega el deploy siguiente: CloudFront va al origen y devuelve el build nuevo **aunque la invalidación no haya corrido**. El check del build id prueba que el Lambda sirve el build nuevo, no que la CDN dejó de servir el viejo a los visitantes. Es la evidencia que la spec pide como precondición de 0029 R3 (AC-9 verde y M-3, que con `curl` tiene el mismo sesgo). | testing §"un test que pasaría aunque el código estuviera mal" · spec AC-9/AC-10 y precondición R3 | Que las 4 rutas HTML pidan con un `Accept` de navegador (el de Chromium como mínimo). Un test del servidor local que aserte ese header. Ajustar M-3 para que `curl` mande el mismo `Accept`. |
| Media | infra/scripts/ci/smoke.mjs:85 | `BUILD_ID_ATTEMPTS` (18) se aplica a todos los fallos de las páginas HTML, no solo a "build id distinto". Con `/` caído (timeouts de 10 s) el smoke tarda ~6 min en ponerse rojo y una cascada en `/buscar`… no suma (corta en la primera ruta). El diseño dice "el resto se queda en 5" y es ambiguo; los tests fijaron 18 para 404, 503 y sin respuesta en `/`. | diseño §SMOKE (reintentos) | Decidirlo de forma explícita: 5 intentos para status ≠ 200 o sin respuesta y 18 solo para el motivo de build id. O dejar 18 y documentarlo en el ADR. |
| Media | infra/lib/open-next-site.ts:281 | El comentario dice que el mismo `CallerReference` "devuelve la invalidación existente en reintentos y rollback" como si fuera una garantía. En el rollback eso significa que **no se invalida nada**: CFN reaplica `evzla-<id viejo>` y CloudFront devuelve la invalidación vieja, ya completada. El HTML que el build nuevo dejó en caché queda hasta 300 s. Quien lea el código en seis meses entiende lo contrario. | comentarios §7 (porqué correcto) | Reescribir el porqué: idempotente en reintentos; en el rollback no re-invalida y la ventana la acota `maxTtl` (ADR-0013, riesgo residual). |
| Baja | infra/lib/open-next-output.ts:47 | El comentario dice que el id viaja "a los logs del smoke", pero el smoke nunca lo imprime (S-4, y hay un test que lo prueba). | comentarios §7 | Quitar "y a los logs del smoke" o reemplazarlo por "y al HTML que compara el smoke". |
| Baja | infra/scripts/ci/smoke.mjs:103 | `SMOKE_PATHS = Object.keys(checksFor(""))` construye checks con un id vacío solo para sacar las claves. Funciona, pero se lee como un truco. | legibilidad §6 | Una constante con la lista de rutas, de la que `checksFor` dependa (o al revés), sin el id ficticio. |
| Baja | infra/scripts/ci/smoke.mjs:15 · infra/lib/open-next-output.ts:48 | La regex `^[A-Za-z0-9_-]{1,64}$` está duplicada. Se entiende: el `.mjs` corre sin tsx. | duplicación §6 | Aceptable. Si se mantiene, poner una referencia cruzada de una línea en uno de los dos lados para que no diverjan. |
| Baja | infra/scripts/ci/smoke.mjs:17 | La regex toma la **primera** aparición de `"b":"…"` del HTML. Hoy hay exactamente una por página: lo verifiqué sobre el build local, en el HTML prerenderizado de `index`, `buscar`, `confianza` y `emergencias`, con 1 coincidencia igual a `assets/BUILD_ID` en cada una (esto cierra la DUDA ABIERTA 1 del diseño). Si en el futuro un prop minificado `b` aparece antes, el smoke falla cerrado ("build id distinto"): es seguro, solo da falsos rojos. | — | Nada por ahora. Si aparece un falso rojo, anclar al prefijo de la fila RSC `0:{`. |
| Baja | infra/test/evzla-stack.test.ts:498,597 | Los tests ubican el handler con la regex `AWS[0-9A-Za-z]+` sobre el `ServiceToken`, que depende del logical id interno del singleton de CDK. Además, `invalidation()` exige exactamente un `Custom::AWS` en todo el stack: un futuro `AwsCustomResource` no relacionado lo rompería con un mensaje engañoso. | tests §5 (acoplamiento) | Filtrar el `Custom::AWS` por `createInvalidation` en `Create` y resolver el handler con `Fn::GetAtt` del `ServiceToken`, sin regex de nombre. |
| Baja | infra/lib/open-next-site.ts:286 | El handler singleton de `AwsCustomResource` usa el runtime por defecto de CDK 2.272 (`nodejs24.x`). Las funciones del sitio usan `NODEJS_22_X` (línea 85). No es un problema funcional (el SDK v3 viene en el runtime e `installLatestAwsSdk: false` es correcto). | — | Solo constatarlo. Migrar las funciones existentes a nodejs24 está fuera de alcance. Si se quiere uniformidad, anotarlo en el backlog del archiver. |

## Puntos pedidos

**Orden de dependencias.** Es correcto. `node.addDependency(this.serverFunction, …)` (open-next-site.ts:270) agrega `DependsOn` sobre todo el subárbol de la función: Function, rol, policy, `FunctionUrl` y los permisos `CloudFrontInvokeViaUrl`. También sobre `VersionedAssets`, `UnversionedAssets`, `CacheSeed` y `TagCacheInit`. La distribución entra por el `Ref` de `DistributionId`. CloudFormation no marca el Lambda como actualizado hasta que termina el update del código (`LastUpdateStatus`), ni la distribución hasta que queda `Deployed`. La función URL no usa alias, así que sirve `$LATEST`. Las piezas que quedan fuera del cierre (ImageFunction, RevalidationFunction, el resto del stack) no producen HTML. No hay ciclos.

**Deploy sin cambio de build id.** Si las propiedades son idénticas, CFN no toca el CR. Eso es correcto cuando el artefacto es el mismo. Hay un caso que no cubre el runbook: un **"Re-run failed jobs"** del job `deploy` reutiliza el artefacto `open-next-${run_id}` y, con él, el mismo BUILD_ID. Si el intento anterior llegó a ejecutar el CR y después hubo rollback, el reintento manda `evzla-<B>` otra vez y CloudFront devuelve la invalidación vieja, sin invalidar. El HTML del build A que se cacheó después del rollback queda hasta 300 s. El smoke (~170-350 s de reintentos) puede salir rojo o verde según la edad de esa caché. Cuando se corrija el hallazgo alto, lo más probable es rojo. Un run nuevo (push o `workflow_dispatch`) recompila y genera otro BUILD_ID, así que no tiene el problema.

**Rollback.** CFN reaplica las propiedades viejas: el `Update` con `evzla-<A>` es un no-op idempotente y el `Delete` del physical id nuevo es un no-op (no hay `onDelete`). No debería llevar a `UPDATE_ROLLBACK_FAILED` salvo que CloudFront devuelva un error. Tampoco re-invalida (ver el hallazgo medio de la línea 281). La ventana residual de ≤ 300 s está declarada en el ADR-0013.

**Policy.** La política está acotada. El único statement del rol del handler es `cloudfront:CreateInvalidation` sobre `arn:…:distribution/<Ref>`, y el test lo afirma con `toEqual` exacto. Ningún `BucketDeployment` lleva `DistributionId`. Ningún statement del stack combina `cloudfront:*` con `"*"`. El server Lambda no tiene permisos de CloudFront ni el id en su entorno (S-2). No hay otro `AwsCustomResource` en `infra/lib` que comparta el rol singleton.

**Parseo del build id en smoke.mjs.** La regex `\\?"b\\?":\\?"…\\?"` acepta la forma escapada y la no escapada. También acepta mezclas (`"b\":"`), lo cual es inocuo. El grupo de captura está acotado a `[A-Za-z0-9_-]{1,64}`, así que no hay riesgo de ReDoS ni de inyección en los logs. El archivo BUILD_ID se valida antes de cualquier request y el error es fijo, sin la ruta. Ver los hallazgos bajos de las líneas 17 y 15.

**Reintentos.** 18 × `SMOKE_RETRY_DELAY_MS` (10 s), más hasta 10 s de timeout por intento, da ≈ 3-6 min por ruta. Sirve para la propagación habitual (1-2 min). La ventana es menor que `maxTtl`, que es lo que hace falta para detectar una invalidación que no ocurrió. El problema lo plantea el hallazgo alto: la variante que mira el smoke. Ver también el hallazgo medio de la línea 85.

## FIDELIDAD AL DISEÑO

| Pieza prevista | Encontrada | Estado |
|---|---|---|
| `OpenNextOutput.buildId` con `confine`, trim, regex y error sin ruta | open-next-output.ts:94-101, 169 | OK |
| `ServerCachePolicy.maxTtl` 300 s, clave sin cambios | open-next-site.ts:195 | OK |
| `deployAssets(): Construct[]` | open-next-site.ts:300-334 | OK |
| CR `HtmlInvalidation`: `/*`, `CallerReference evzla-<id>`, `fromResponse("Invalidation.Id")`, sin `onDelete`, policy acotada, `installLatestAwsSdk:false`, `logGroup` propio | open-next-site.ts:275-298 | OK |
| Dependencias al final del constructor | open-next-site.ts:269-270 | OK |
| `evzla-stack.ts`, `app.ts` y `ci-stack.test.ts` sin cambios | sin diff | OK |
| Smoke `<url> <build-id-file>`, 7 rutas, motivos fijos, 18/5 intentos | smoke.mjs | OK (ver el hallazgo medio de la línea 85 sobre el alcance de los 18) |
| Workflow: solo cambia el argumento del smoke | deploy-production.yml:165 | OK. La ruta existe en el job `deploy` (`mv -T` en la línea 129) |
| Comentario del home | page.tsx:6-8 | OK (resuelve la DUDA ABIERTA 2) |

No hay desviaciones sin justificar ni piezas nuevas fuera del diseño. Los imports coinciden (`node:fs/promises` en el smoke; `cr` e `iam` ya estaban).

## TESTS

- AC-1: `invalidates /* … exactly once` y `never invalidates through a BucketDeployment`.
- AC-2: `runs after the server code, the assets…` (`arrayContaining` con los logical ids reales).
- AC-3: `keys the call on the build id…`, con un fixture temporal `next-build-2` que demuestra que la propiedad cambia.
- AC-4: `grants the invalidation handler only CreateInvalidation…` y `never grants a CloudFront action on every resource…`.
- AC-5 y S-3: `caps the shared cache…` y `keeps the cache key identical…`.
- AC-6: los tests existentes del stack no cambian.
- AC-7: `ci-stack.test.ts` sin diff.
- AC-8: `smokes the deployed build id after cdk deploy…` en ci-workflow.test.ts.
- AC-9: el caso OK y el del payload sin escapar.
- AC-10 y S-4: `it.each(HTML_PATHS)` para el id distinto (sin imprimir el id servido ni el cuerpo) y para el id ausente.
- AC-11: la lista exacta de rutas, sin `?` y sin `/api`.
- S-2: `keeps CloudFront out of the public server function`.
- Archivo BUILD_ID: open-next-output.test (ausente, inválido, symlink fuera) y `fails closed without a valid build id file` en el smoke.

Tests débiles:
- Ningún test fija los headers que manda el smoke. Esto es la otra cara del hallazgo alto: la suite pasaría igual con un smoke que nunca mira la variante de los navegadores.
- El acoplamiento al id interno del singleton de CDK (líneas 498 y 597).

Los nombres de los tests describen comportamiento y asertan motivos fijos y conteos de intentos exactos. No encontré tests triviales.

## DEUDA INTRODUCIDA

- Ningún `TODO`/`FIXME`, `any`, `@ts-ignore` ni `eslint-disable` nuevo.
- Hay casts en los tests (`as Entry`, `as { "Fn::GetAtt": string[] }`) para navegar la plantilla. Son el patrón que ya usa el archivo y no los cuento como hallazgo.
- Hay un `catch {}` sin variable en `readBuildId` (open-next-output.ts:97 y smoke.mjs:42). Es intencional: falla cerrado con un mensaje fijo, sin la ruta.

## OBSERVACIONES PARA EL ARCHIVER (diseño, no hallazgos del diff)

1. El `CallerReference` igual al BUILD_ID hace que el rollback y el "re-run" del job `deploy` con el mismo artefacto no invaliden. Propuestas: agregar al runbook "tras un rollback, relanzar con un run nuevo, no con Re-run, o invalidar a mano"; o evaluar que el `CallerReference` incluya algo propio de cada intento (por ejemplo `GITHUB_RUN_ATTEMPT` en el synth).
2. Con `accept` en la clave de caché, cada familia de navegador tiene su propia variante del HTML. La invalidación `/*` las cubre todas, pero cualquier verificación externa (smoke, M-3) tiene que elegir una variante de forma explícita.
3. Hay que confirmar en el primer deploy que el `Accept` de los navegadores reales recibe el build nuevo (M-1/M-3 con el `Accept` del navegador).

## Re-revisión T-8

Diff `d64c80c..HEAD` (658fe56, 386ded3, bac8e39, 4a2dc85). `pnpm --filter @evzla/infra test -- test/ci-scripts.test.ts -t "smoke.mjs" --reporter=dot` → `Tests 24 passed | 126 skipped (150)`.

RESUMEN: 3 hallazgos nuevos (0 alta / 2 media / 1 baja) · veredicto: APROBADO

Hallazgos anteriores:
- Alta (Accept): resuelto. `htmlPage` manda `accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` (smoke.mjs:17,88,111). El test `asks for the HTML pages with a browser Accept header…` lee `req.headers.accept` en el servidor local y lo compara con `toEqual` exacto en las 3 rutas. Sin el header, undici manda `*/*` y el test falla, así que no pasaría con el código mal. M-3 ya usa `curl -H 'accept: …'`.
- Media (18 para todo): resuelto. El tope depende del motivo (smoke.mjs:122). Los tests de 404, 503, sin respuesta, título ausente y build id ausente cortan en 5. El de `build id distinto` llega a 18. `stops after 5 attempts when a stale build id turns into an unexpected status` cubre el cambio de motivo.
- Media (comentario del CallerReference): resuelto. open-next-site.ts:281-282 ya no lo presenta como garantía y nombra la ventana de 300 s.
- Baja (open-next-output.ts:47): resuelto.
- `/buscar` fuera: correcto. `apps/web/app/buscar/page.tsx` solo hace `redirect("/")`. El motivo quedó en el comentario de smoke.mjs:95 y en spec/diseño.
- Bajas no tratadas (`checksFor("")`, regex duplicada, regex sobre el ServiceToken, runtime): siguen abiertas y no bloquean. Están declaradas en el apply-progress.

| Sev | Archivo:línea | Hallazgo · escenario de falla | Regla | Qué se espera |
|---|---|---|---|---|
| Media | infra/scripts/ci/smoke.mjs:122-125 | El tope se calcula con el `n` absoluto y no con los fallos de cada motivo. Pasado el intento 5, un fallo que no sea stale corta en el acto, sin ningún reintento. Ejemplo: un timeout o 503 transitorio en el intento 11, mientras se propaga la invalidación, deja el smoke en rojo. Es justo el momento en que la invalidación provoca misses y el Lambda recién desplegado arranca en frío. Antes de T-8 ese caso tenía 7 reintentos; con un fallo en el intento 1 tendría 4. El log `intento 11/5` lo deja ver. Ningún test fija el comportamiento con n > 5 (el de stale → 503 cambia en n = 2). | legibilidad §6 · diseño §SMOKE ("status inesperado corta en 5") | Respuesta a la observación del implementer: el log `11/5` no es aceptable tal como está, porque lo que muestra es una asimetría real. Hay dos salidas. (a) Contar los fallos no stale aparte (o los consecutivos), así que cada motivo tiene su propio presupuesto de 5, y el log pasa a ser `n/18` o el contador del motivo. (b) Dejarlo así, decirlo de forma explícita en el diseño y agregar un test con stale hasta n ≥ 5 seguido de 503 que fije el corte inmediato. Con (a), el caso pedido sigue cubierto. |
| Media | adr/0013-frescura-html-cloudfront.md:24,27 | El ADR no se alineó con T-8. La línea 24 dice "Todo deploy re-invalida y los reintentos son idempotentes", lo que contradice el comentario corregido y el diseño: un Re-run del mismo artefacto o un rollback no re-invalidan. La línea 27 dice "las cuatro rutas", no menciona el `Accept` y sigue con 18 para todo. La línea 7 nombra `/buscar` como HTML prerenderizado (es un 307). | coherencia de artefactos · comentarios §7 | Ajustar las decisiones 3 y 5 (y la línea 7) al diseño vigente: 3 rutas HTML con `Accept` de navegador, 18 solo para stale, y sin re-invalidación en Re-run ni rollback. |
| Baja | docs/sdd/0030-cloudfront-stale-html/05-apply-progress.md:128 · 04-plan.md:17 | La nota para el verifier dice que `03-design.md` línea 28 "no se tocó", pero 4a2dc85 sí la alineó (diseño:28). En el plan, T-4 conserva "4 rutas HTML" y "`BUILD_ID_ATTEMPTS = 18`, el resto 5" con una sola anotación de retiro. Se entiende como histórico, pero se presta a confusión. | coherencia de artefactos | Actualizar la nota del apply-progress y marcar en T-4 que T-8 sustituye el criterio de rutas y de reintentos. |

Coherencia spec/diseño/plan: AC-9/10/11, M-3, RESUMEN, SMOKE y DUDA 1 del diseño, T-7 y T-8 del plan coinciden con el código: 3 rutas, `Accept` de navegador y 18 solo para stale. Diseño:52 ("En el rollback… es idempotente") sigue siendo exacto: dice que el error no se repite, no que se invalide.
TESTS (T-8): AC-9 → `asks for the HTML pages with a browser Accept header…` y el caso OK. AC-10 → `it.each(HTML_PATHS)`: el id distinto cae en 18 y el ausente en 5. AC-11 → la lista exacta de 6 rutas. Débil: falta fijar el corte con n > 5 (hallazgo medio de arriba).
DEUDA INTRODUCIDA: ninguna (sin TODO, casts nuevos ni supresiones).
