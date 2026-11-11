# 0029 function-url-oac: spec

RESUMEN
- Las Function URL de server e imágenes pasan de NONE a AWS_IAM, firmadas por CloudFront OAC (SigV4), en tres releases: R1, R2, R3.
- R1: interceptor de `window.fetch` (hash del body), control de envío antes de hidratar, `x-revalidate-token`, OAC NO_OVERRIDE y permisos; URLs siguen NONE.
- R2: imágenes a AWS_IAM + SIGV4_ALWAYS. R3: server a AWS_IAM + SIGV4_ALWAYS.
- `x-origin-verify` y `proxy.ts` se conservan sin cambios. No se toca BD, roles ni `sensitive`.
- AC automáticos (AC-1..AC-26) bloquean el release indicado; AC-M (manuales) se ejecutan tras cada deploy.
- Fuera de alcance: migrar el runtime Node y cualquier otro cambio de infraestructura.
- Hay DUDAS ABIERTAS al final.

ESTADO: borrador

OBJETIVO · ACTORES
- Objetivo: que las Function URL no sean invocables desde internet sin firma de CloudFront, sin romper ningún POST ni la revalidación.
- Actores: visitante público, administrador, llamador de revalidación (job o persona con el token), CloudFront (firmante), humano de operación (aprueba y verifica cada release).
- Datos de ejemplo: solo sintéticos (`Persona Prueba`, `V-00000000`, host `example.test`).

CRITERIOS DE ACEPTACIÓN

Interceptor (R1; AC-1..AC-9 bloquean R3 vía C1)
- AC-1 Given una petición same-origin con método POST, PUT, PATCH o DELETE y body string, When pasa por el interceptor, Then se envía `x-amz-content-sha256` = SHA-256 hexadecimal en minúsculas de los bytes UTF-8 exactos del body.
- AC-2 Given una petición same-origin con body FormData, When pasa por el interceptor, Then el FormData se serializa una sola vez a bytes, se envían esos bytes con el `Content-Type` y boundary exactos con los que se serializó, y el header es el SHA-256 de esos mismos bytes.
- AC-3 Given una petición same-origin POST sin body, When pasa por el interceptor, Then el header es el SHA-256 de la cadena vacía (`e3b0c442…b855`).
- AC-4 Given una petición GET o HEAD same-origin, When pasa por el interceptor, Then no se calcula hash ni se agrega el header ni se lee el body.
- AC-5 Given una petición con destino de otro origen (ej. PUT prefirmado a `https://bucket.example.test/…`), When pasa por el interceptor, Then la petición sale idéntica a la original: sin header, sin reserializar el body, sin cambio de `Content-Type`.
- AC-6 Given dos llamadas consecutivas con bodies distintos (o la misma llamada reintentada), When pasan por el interceptor, Then cada una calcula su propio hash a partir de su propio body; ninguno se cachea ni se reutiliza.
- AC-7 Given `crypto.subtle` no disponible, When pasa una petición con body, Then sale sin header y sin lanzar error.
- AC-8 Given cualquier ejecución del interceptor, When termina (éxito o error), Then no se escribe body, hash ni término en consola, storage ni red adicional; los errores propios solo se exponen como `nombre:código`.
- AC-9 Given un `next build` real de Next 16.4.2 con el interceptor instalado frente a un servidor local que compara el header con el SHA-256 de los bytes recibidos, When se ejecuta una Server Action con body string y otra con FormData multipart, Then el servidor ve coincidencia en ambas, y un PUT al segundo origen local llega sin el header.

Control de envío antes de hidratar (R1)
- AC-10 Given el HTML renderizado en servidor de cada uno de los 15 formularios inventariados (públicos: `search-panel`, `submit-service-form`, `report-service-button`, `manage-service-form` ×2; admin: `services-admin-browser` ×5, `(protected)/layout` ×2, `review-case-actions` ×2, `foreign-row-actions` ×1 con dos botones `formAction`), When se inspecciona, Then todo botón submit viene `disabled`.
- AC-11 Given que la hidratación terminó y no hay envío pendiente, When se inspecciona el botón, Then está habilitado; mientras `pending`, sigue deshabilitado como hoy.
- AC-12 Given el botón deshabilitado, When el usuario presiona Enter en un campo, Then no se envía el formulario.
- AC-13 Given una guarda estática sobre `apps/web`, When aparece un `<form action>` o `formAction` sin el botón de envío controlado, Then la guarda falla con el archivo y la línea.
- AC-14 Given los formularios públicos, When se renderizan, Then contienen un `<noscript>` en español que indica que hace falta JavaScript; los admin no lo requieren.

Revalidación (R1; la ruta no lee el body)
- AC-15 Given POST `/api/revalidate` con `x-revalidate-token` válido, When se procesa, Then responde 200 y revalida.
- AC-16 Given token ausente o incorrecto en `x-revalidate-token`, When se procesa, Then responde 401 con `code` y no revalida.
- AC-17 Given `Authorization: Bearer <token válido>` sin `x-revalidate-token`, When se procesa, Then responde 401 (no hay lectura dual) y no revalida.
- AC-18 Given cualquier petición a `/api/revalidate`, When se loggea o cachea, Then el valor del token no aparece en logs ni en la clave de caché.

Síntesis CDK (tests de infra; un bloque por release)
- AC-19 R1 Given la plantilla sintetizada, When se filtran los `AWS::CloudFront::OriginAccessControl` por tipo de origen `lambda`, Then hay uno por Function URL (server e imágenes) con `SigningProtocol` sigv4 y `SigningBehavior` no-override, ambas URL tienen `AuthType` NONE, y el OAC existente del bucket S3 queda fuera del filtro (la plantilla tiene tres OAC en total).
- AC-20 R1 Given la plantilla, When se inspeccionan los permisos de cada función, Then existe `lambda:InvokeFunctionUrl` sin condición `FunctionUrlAuthType` (así lo crea CDK 2.272.0 con OAC) y `lambda:InvokeFunction` con `InvokedViaFunctionUrl` true, ambos con principal `cloudfront.amazonaws.com` y `SourceArn` igual a la referencia a la distribución de EvzlaStack (no comodín).
- AC-21 R2 Given la plantilla, When se inspecciona, Then la URL de imágenes tiene `AuthType` AWS_IAM y su OAC `SigningBehavior` always; la del server sigue NONE + no-override.
- AC-22 R3 Given la plantilla, When se inspecciona, Then ambas URL tienen `AuthType` AWS_IAM y ambos OAC lambda `SigningBehavior` always; ninguna `AWS::Lambda::Permission` tiene principal `*` sobre estas funciones.
- AC-23 R1, R2 y R3 Given la plantilla, When se filtran los orígenes con `x-origin-verify`, Then sigue habiendo exactamente 1 con ese custom header y es el del server; el de imágenes no lo lleva.
- AC-24 R1, R2 y R3 Given la plantilla, When se inspecciona la política de origen, Then se mantiene `ALL_VIEWER_EXCEPT_HOST_HEADER`, y el test existente de L120 sigue verde sin cambios.
- AC-25 R3 Given el comentario previo sobre URLs NONE en `open-next-site.ts`, When se lee el archivo, Then ya no afirma que las URL son públicas por diseño y remite a ADR-0012.
- AC-26 R1, R2 y R3 Given `pnpm typecheck && pnpm test && pnpm build`, When corren, Then terminan verdes.

Verificación post-deploy (MANUAL; la ejecuta el humano con datos ficticios o propios, sin pacientes reales)
- AC-M1 R2 y R3 Given el deploy completado, When se hace una llamada directa (sin firma) a la Function URL de imágenes (R2) y a la del server (R3), Then responde 403.
- AC-M2 R1 Given las URL en NONE, When se hace la llamada directa, Then se registra la respuesta; no se exige 403.
- AC-M3 R1, R2 y R3 Given el sitio por CloudFront, When se piden la home, una página SSR, una imagen optimizada no cacheada (`/_next/image`) y un POST real de búsqueda, Then todos responden con éxito.
- AC-M4 R3 Given el deploy completado, When se ejecuta una acción admin real y, si aplica, una subida Excel y un dictado de voz, Then terminan con éxito (cubre C3).
- AC-M5 R1, R2 y R3 Given el token de revalidación, When se llama POST `/api/revalidate` con `x-revalidate-token`, Then responde 200 y el sello "Actualizado" se refresca. Desde R3 el llamador debe enviar además `x-amz-content-sha256` (con body vacío, el SHA-256 de la cadena vacía); sin él la llamada falla en la firma.
- AC-M6 R2 y R3 Given credenciales humanas, When se ejecuta `aws lambda list-function-url-configs` por función, Then R2 muestra `AWS_IAM` en la de imágenes y R3 en ambas.
- AC-M7 R2 Given la política de la función del server leída sin modificar, When se inspecciona, Then contiene los dos permisos de CloudFront (cubre C2); además una imagen no cacheada responde 200.

CASOS BORDE (por AC)
- AC-1/2: Unicode (`Ñandú Pérez`, emoji) y archivo binario: hash sobre bytes, no caracteres.
- AC-2: un FormData reutilizado en dos llamadas produce dos serializaciones y dos boundaries.
- AC-6: reintento tras fallo de red recalcula; dos acciones simultáneas no mezclan hashes.
- AC-5: URL relativa y absoluta al mismo host son same-origin; subdominio distinto es otro origen.
- AC-10: HTML sin JavaScript (curl al render) ya muestra `disabled`.
- AC-17: `Authorization` con token válido nunca autoriza.

SEGURIDAD (escenarios negativos)
- S-1 Llamada directa sin firma a una URL en AWS_IAM: 403 (AC-M1); firma de otra cuenta o distribución: rechazada (el `SourceArn` fija la distribución; AC-20).
- S-2 `x-origin-verify` ausente o incorrecto: `proxy.ts` rechaza como hoy.
- S-3 Ningún log (CloudWatch, consola, `search_log`) contiene body, hash, término, cédula o token (AC-8, AC-18); errores como `safeErrorTag`.
- S-4 El buscador sigue devolviendo solo hospital, teléfono de mesa, nombre y confianza; nada de `sensitive` se expone.
- S-5 Tenant: no aplica; no se agrega campo de tenant a DTO alguno.

CONTRATOS
- HTTP `POST /api/revalidate`: header `x-revalidate-token`; 200 ok; 401 `{code}` token ausente/incorrecto o solo Bearer. No lee el body, no hay 400. `Authorization` se ignora. Desde R3 el llamador envía también `x-amz-content-sha256` (SHA-256 de la cadena vacía). Cambio de contrato público, va a ADR-0012.
- Header saliente del cliente (consumido por CloudFront para firmar): `x-amz-content-sha256`.
- Eventos y jobs: ninguno nuevo ni modificado.
- Infra: dos `AWS::Lambda::Url`, un OAC lambda por URL, permisos por función (AC-19..22).

CONSISTENCIA
- Inmediato: hash por petición, control de envío, validación de token, firma y 403 por CloudFront.
- Eventual: propagación de CloudFront y CloudFormation tras cada deploy; la verificación manual se hace al terminar el deploy.
- Pestañas con código anterior a R1 reciben 403 tras R3 hasta recargar (aceptado).

FUERA DE ALCANCE
- Migrar el runtime Node y cualquier otro cambio de infraestructura.
- Retirar `x-origin-verify` o `proxy.ts`.
- Canario, telemetría y espera entre releases (decisión vigente).
- Aviso de recarga ante 403 (backlog).
- Envío de formularios sin JavaScript (se pierde por decisión aceptada).
- Formularios `onSubmit` (sus handlers usan Server Actions por JS, cubiertos por AC-1..9).
- Ensayo de la reversión de emergencia por CLI (NO ENSAYADA; C4 es del humano).

DUDAS ABIERTAS
1. ¿Existen llamadores externos de `/api/revalidate`? Bloquea R1 (C5). Humano.
2. ¿Quién tiene credenciales de emergencia durante R3 y en qué horario? Bloquea R3 (C4). Humano.
3. Tamaño máximo de audio y Excel en modo `direct` (hash en memoria del navegador, límite ~6 MB de Lambda); AC-M4 lo verifica con un archivo representativo.
4. Si el test existente de L301 sobrevive a la nueva forma del origen: confirmar con synth; AC-23 fija el comportamiento esperado.
5. Límite de body de CloudFront OAC para multipart grande: no verificado; AC-M4 lo cubre en real.
