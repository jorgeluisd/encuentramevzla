# 0029 function-url-oac: proposal

RESUMEN
- Enfoque único (decisión humana): Function URL de server e imágenes a AWS_IAM con OAC SigV4; el navegador calcula `x-amz-content-sha256` con un interceptor de `window.fetch`.
- Tres releases a main: R1 cliente + OAC sin efecto (NONE + SIGV4_NO_OVERRIDE), R2 imágenes IAM, R3 server IAM. Sin canario, sin telemetría y sin espera entre releases, porque el sitio hoy no se está usando.
- Hallazgo que fija la secuencia: el dominio de la distribución referencia la URL, así que CloudFormation cambia la URL antes que CloudFront. Pasar a IAM y agregar OAC en el mismo release deja 403 hasta que propague; por eso imágenes también pasa por R1.
- La prueba de hash es local y bloquea R3: build real de Next 16.4.2 contra un servidor que compara el header con el SHA-256 de los bytes recibidos.
- Riesgo residual: la primera validación de POST contra IAM real ocurre en R3. Se mitiga con verificación manual inmediata y reversión por CLI preparada, cuyos comandos quedan NO ENSAYADOS.
- El smoke de CI no hace POST por diseño: R3 puede quedar verde con los POST rotos.
- Costo aceptado: sin JavaScript no se puede enviar ningún formulario. La búsqueda ya lo exige por Turnstile.
- ADR-0012 PROPUESTO reemplaza la decisión del comentario de `infra/lib/open-next-site.ts:147`.

ENFOQUES

A. AWS_IAM + OAC + hash en el navegador (único enfoque vigente)
- Descripción: CloudFront firma cada petición al origen; la Function URL rechaza lo no firmado. Para POST, el navegador envía el SHA-256 del body y CloudFront lo incluye en la firma.
- Pros: la URL deja de ser invocable desde internet sin depender de un secreto compartido; búsquedas y audio siguen el mismo camino de hoy, sin función intermedia; CDK ya trae `FunctionUrlOrigin.withOriginAccessControl` (2.272.0).
- Contras: acopla la disponibilidad de todo POST a código cliente; una pestaña anterior a R1 recibe 403 tras R3 hasta recargar; se pierde el envío sin JS.
- Adopción: 3 releases y 3 aprobaciones (más fast-forward de develop); 1 interceptor, 1 control de envío, tests de infra nuevos.
- Salida: reversible por fase (ver REVERSIÓN). Sin cambio de esquema ni de datos.
- Invariantes: no toca `search_patient`, roles ni `sensitive`. El interceptor no loggea ni persiste bodies ni hashes. `x-origin-verify` y `proxy.ts` se conservan como segunda capa, sin cambios.

Descartadas (decisión humana, no se reabren)
- Lambda@Edge: agrega infra en us-east-1, ve solo ~1 MB de body y haría pasar búsquedas y audio de pacientes por otra función.
- Lambda Web Functions: descartada por decisión humana junto con Lambda@Edge.
- Server en NONE + `x-origin-verify` como único control: descartada; deja la URL invocable desde internet.

D1. Secuencia de despliegue (reversible por fase; cada fase es un release a main con aprobación)

| Fase | Contenido | Estado al terminar | Salida de fase |
|---|---|---|---|
| R1 cliente + OAC preparatorio | Interceptor, control de envío (D2), `x-revalidate-token` (D3); OAC SIGV4_NO_OVERRIDE en server e imágenes; permisos de CloudFront por función (`InvokeFunctionUrl` e `InvokeFunction` con `invokedViaFunctionUrl`) | URLs NONE; CloudFront firma | Smoke + un POST real responde bien con el header presente |
| R2 imágenes | Imágenes a AWS_IAM + SIGV4_ALWAYS | Imágenes cerradas; server sin cambio | C2: valida en real OAC y permisos con GET |
| R3 server | Server a AWS_IAM + SIGV4_ALWAYS; reescribe el comentario L147 | Ambas URLs cerradas | C3: verificación manual de POST inmediata |

- R1 no necesita separarse: con las URLs en NONE nada de su contenido depende del orden interno del deploy. El interceptor, el token y la firma son inocuos entre sí y la autorización aún no se aplica. El costo de agruparlos es que se revierten juntos y un fallo en R1 tarda más en atribuirse; no es razón técnica para otro release.
- Por qué no hay ventana de 403:
  - La URL cambia antes que CloudFront, pero desde R1 CloudFront ya firma y ya tiene permiso. Al pasar a IAM, toda petición llega firmada.
  - SIGV4_NO_OVERRIDE solo deja de firmar si el viewer manda `Authorization`; tras D3 ningún cliente legítimo lo hace.
  - CDK rechaza SIGV4_ALWAYS con NONE (`validateAuthType`) y acepta NO_OVERRIDE. Server e imágenes necesitan un OAC cada uno entre R2 y R3, porque firman distinto.
- CDK solo agrega `lambda:InvokeFunctionUrl` al usar OAC: `InvokeFunction` con `invokedViaFunctionUrl` debe declararse a mano y fijarse con test.
- No hay plazo mínimo entre releases: el sitio no se usa, así que no hay pestañas abiertas que proteger. Si vuelve a usarse antes de R3, el humano reevalúa la espera.

D2. Formularios antes de hidratar (reversible)
- Mecanismo: botón hoja cliente que renderiza `disabled` en SSR y se habilita al hidratar (`useSyncExternalStore` con snapshot de servidor `false`), combinado con el `disabled` por `pending` que ya existe.
- Por qué basta con el botón: según HTML, un botón por defecto deshabilitado también bloquea el envío implícito con Enter. Se exige botón submit en cada formulario del inventario.
- Por qué no otras opciones: un listener global llega con el JS, justo después de la ventana de riesgo; `<fieldset disabled>` impediría escribir mientras carga en conexiones lentas, y el botón hoja permite teclear.
- Alcance verificado: 15 formularios.
  - Públicos (5): `search-panel`, `submit-service-form`, `report-service-button`, `manage-service-form` ×2.
  - Admin (10): `services-admin-browser` ×5, `(protected)/layout` ×2, `review-case-actions` ×2, `foreign-row-actions` ×1 (dos botones con `formAction`).
  - Corrige el explore: `review/page.tsx:191` y `foreign-rows/page.tsx:57` son props, no formularios.
  - Los formularios `onSubmit` quedan fuera: sus handlers de admin invocan Server Actions por JS. Ninguno declara `method=post`.
- Una guarda estática debe fallar si aparece un `<form action>` o `formAction` sin este botón (forma concreta: designer).
- `<noscript>` con texto en español, solo en formularios públicos, explica que hace falta JavaScript.

D3. `/api/revalidate` (contrato público: va en ADR)
- En R1 el token pasa de `Authorization: Bearer` a `x-revalidate-token`, sin lectura dual; `Authorization` se ignora desde ese release.
- Motivo: con SIGV4_ALWAYS CloudFront sobrescribe `Authorization`, y con NO_OVERRIDE un Bearer impediría firmar. Mover el token en R1 elimina el único `Authorization` legítimo conocido.
- Desde R3 el llamador también debe enviar `x-amz-content-sha256`; con body vacío, el SHA-256 de la cadena vacía. Lo exige Lambda para la petición firmada, y un llamador fuera del navegador no pasa por el interceptor.
- Es el único route handler con POST (verificado). El header no entra a la clave de caché ni se loggea.

D4. Interceptor: reglas que condicionan el enfoque (el diseño concreto es del designer)
- Solo mismo origen. El PUT prefirmado a S3 de `stage-excel-upload.ts` es de otro origen y no debe llevar el header.
- Métodos con body (POST/PUT/PATCH/DELETE); body ausente se hashea como cadena vacía.
- FormData se serializa una sola vez a bytes y se envían esos bytes con su `Content-Type` y boundary exactos. El hash se calcula por llamada, nunca se reutiliza.
- `crypto.subtle` ausente (solo fuera de HTTPS, dev local): pasa sin header; producción redirige a HTTPS.
- Se instala desde `instrumentation-client.ts` con la lógica en `lib/`, porque Vitest solo corre `lib/**/*.test.ts` en node.

D5. REVERSIÓN (siempre en orden inverso; no revertir una fase con otra posterior activa)

| Fase | Reversión normal | Efecto |
|---|---|---|
| R1 | `workflow_dispatch` al SHA previo | Sale interceptor, control de envío, token nuevo, OAC y permisos; URLs siguen en NONE. Con R3 activa, revertir R3 primero |
| R2 | `workflow_dispatch` al SHA de R1 | Imágenes a NONE + NO_OVERRIDE; CDK recrea los permisos públicos |
| R3 | `workflow_dispatch` al SHA de R2 | Server a NONE + NO_OVERRIDE; requiere build, aprobación y deploy |

Emergencia en R3 (CLI, credenciales humanas; identificadores de sentencia distintos a los de CloudFormation). **COMANDOS NO ENSAYADOS:**
```
aws lambda update-function-url-config --function-name <server> --auth-type NONE
aws lambda add-permission --function-name <server> --statement-id emergency-public-url \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE
aws lambda add-permission --function-name <server> --statement-id emergency-public-invoke \
  --action lambda:InvokeFunction --principal '*' --invoked-via-function-url
```
- Sin ensayar: la sintaxis de `--invoked-via-function-url` y el resultado de SIGV4_ALWAYS + NONE, combinación que CDK no permite sintetizar. Si la emergencia no restablece los POST, el camino es `workflow_dispatch` al SHA de R2, que deja NO_OVERRIDE + NONE.
- Postura de seguridad durante la emergencia: la de hoy (`x-origin-verify` sigue exigido).
- Reconciliación obligatoria: CloudFormation no detecta el drift, y un deploy con AWS_IAM en la plantilla dejaría la URL en NONE sin avisar. Tras la emergencia: `workflow_dispatch` al SHA de R2 y luego `remove-permission` de las dos sentencias manuales.

CONDICIONES BLOQUEANTES

| # | Condición (bloquea) | Responsable | Fallback |
|---|---|---|---|
| C1 | Prueba local, sin infra: `next build` real de 16.4.2 con el interceptor frente a un servidor local que compara `x-amz-content-sha256` con el SHA-256 de los bytes recibidos. Cubre Server Action real con body string, FormData multipart con boundary exacto y exclusión del PUT a S3 (un segundo origen local recibe el PUT sin el header). Test unitario: dos llamadas generan hashes independientes (bloquea R3) | implementer + verifier | R3 no sale; server sigue en NONE; se vuelve al humano |
| C2 | Tras R2: imagen no cacheada responde 200 por OAC + IAM real, y la política del server contiene los dos permisos de CloudFront, leída sin modificar (bloquea R3) | verifier + humano | Corregir en un release previo a R3 |
| C3 | Plan de verificación listo antes de aprobar R3: justo después del deploy, un POST real de búsqueda, una acción admin y, si aplica, subida Excel y dictado, con datos ficticios o propios, sin pacientes reales (bloquea R3) | humano | Fallo en la verificación: reversión D5 |
| C4 | Reversión por CLI preparada de antemano: comandos con los nombres reales fuera del repo, una persona con credenciales disponible y reconciliación de drift escrita. Se reconoce que no está ensayada (bloquea R3) | humano | R3 no se aprueba hasta tenerla |
| C5 | Humano confirma llamadores externos de `/api/revalidate`. Antes de R1 los pasa a `x-revalidate-token`; antes de R3 les agrega `x-amz-content-sha256` (SHA-256 de la cadena vacía si no hay body) (bloquea R1 y R3) | humano | Si no hay ninguno conocido, seguir: el impacto se limita al sello "Actualizado" |

Riesgo residual: la primera validación de POST contra IAM real ocurre en R3. C1 prueba los bytes y C2 prueba OAC y permisos con GET, pero ninguna prueba el POST firmado completo. Mitigación: C3 y C4. Sigue sin verificar antes de R1 que la URL NONE ignore la firma de CloudFront; R1 lo revela al primer tráfico, con reversión normal.

Sobre el wrapper de Next (corrige el explore): `fetchInternal` solo usa el fetch previo al lock si `__NEXT_EXPOSE_TESTING_API` está activo, y eso exige Cache Components y dev o `exposeTestingApiInProductionBuild`; `next.config.ts` no activa ninguno. El reintento offline depende de `experimental.useOffline`, también inactivo: C1 lo cubre con la independencia por llamada, por si se activa en el futuro.

RECOMENDACIÓN
Enfoque A con tres releases R1→R3.
1. Es la secuencia mínima que evita el 403 dado el orden real de CloudFormation (URL antes que distribución).
2. Imágenes valida permisos y OAC con GET antes de arriesgar la búsqueda.
3. Sin uso actual del sitio, canario, telemetría y espera cuestan más que el riesgo que cubrirían; el residual queda declarado.
4. C1 detecta sin infra el fallo más probable: bytes y boundary que no coinciden con el hash.
5. No agrega función intermedia sobre búsquedas ni audio.

ADR: PROPUESTO → `adr/0012-function-url-aws-iam-oac.md` (ruta del proyecto; la skill `/new-adr` no existe en el repo, se siguió el formato de ADR-0011).

DECISIONES MENORES TOMADAS (reversibles)
- `x-origin-verify` y su secreto se conservan; retirarlos sería otra decisión.
- Se mantiene `ALL_VIEWER_EXCEPT_HOST_HEADER`, compatible con OAC y necesaria para reenviar el hash.

DUDAS ABIERTAS
1. ¿Existen llamadores externos de `/api/revalidate` no versionados? (humano; C5)
2. ¿Quién tiene credenciales para la emergencia durante R3 y en qué horario se aprueba? (humano; C4)
3. ¿Conviene un aviso de recarga ante 403 para cuando el sitio vuelva a usarse? (spec-writer)
4. El test L301 debería sobrevivir, porque el origen con OAC conserva custom headers; confirmar con synth. (designer)
5. Audio y Excel en modo `direct` siguen sujetos al límite de ~6 MB de Lambda; OAC no lo cambia, pero el hash carga el body en memoria del navegador. Confirmar el tamaño máximo de audio. (spec-writer)
