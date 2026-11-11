# ADR-0012 — Function URL con AWS_IAM y OAC, con hash del body calculado en el navegador

Fecha: 2026-11-09 · Estado: **PROPUESTO** · Reemplaza: la decisión de mantener `AuthType NONE` + `x-origin-verify`, documentada solo en el comentario de `infra/lib/open-next-site.ts:147` · Complementa: [ADR-0010](./0010-migracion-supabase-vercel-a-aws.md) y [ADR-0011](./0011-ci-cd-github-actions-oidc.md) · Feature: [`docs/sdd/0029-function-url-oac/`](../docs/sdd/0029-function-url-oac/01-proposal.md).

## Contexto

Las Function URL del server y del optimizador de imágenes usan `AuthType NONE`: cualquiera puede invocarlas sin pasar por
CloudFront. El server se defiende con el header `x-origin-verify`, validado en `proxy.ts`; imágenes no tiene ningún control
de origen. La decisión de no usar OAC se registró en un comentario de código: con OAC, los POST deben incluir el SHA-256 del
body en `x-amz-content-sha256`, y sin él los Server Actions fallan.

Todos los POST del sitio son Server Actions de Next 16.4.2, salvo `/api/revalidate`. El cliente los emite con el `fetch`
global, por lo que el hash se puede calcular en el navegador. CI despliega solo en push a `main` con aprobación manual
(ADR-0011): cada fase de despliegue es un release. La decisión se toma con el sitio sin uso actual.

## Decisión

1. Las Function URL de server e imágenes pasan a `AWS_IAM`, firmadas por CloudFront con OAC SigV4 (`SIGV4_ALWAYS`). Imágenes
   se cierra primero porque solo recibe GET/HEAD/OPTIONS.
2. Un interceptor de `window.fetch` instalado desde `instrumentation-client` agrega `x-amz-content-sha256` a las peticiones
   del mismo origen con método de escritura. Nunca loggea ni persiste bodies ni hashes.
3. El envío de los formularios con `<form action>` o `formAction` queda deshabilitado hasta hidratar: un POST nativo no
   lleva hash y sería rechazado.
4. `/api/revalidate` recibe su token en `x-revalidate-token`, sin lectura dual, porque CloudFront usa `Authorization` para
   firmar.
5. `x-origin-verify` se conserva como segunda capa.
6. Despliegue en tres releases sin ventana de 403:
   - R1: interceptor, control de envío, `x-revalidate-token`, y OAC con `SIGV4_NO_OVERRIDE` sobre URLs `NONE` con permisos
     de CloudFront en server e imágenes.
   - R2: imágenes a `AWS_IAM` + `SIGV4_ALWAYS`, que valida en real OAC y permisos con GET.
   - R3: server a `AWS_IAM` + `SIGV4_ALWAYS`.

   No hay canario, telemetría ni espera entre releases.
7. Requisito previo a R3: prueba local, sin infra, con el build real de Next 16.4.2 y un servidor que compara
   `x-amz-content-sha256` con el SHA-256 de los bytes recibidos (body string, FormData multipart y exclusión del PUT a S3).
8. Reversión: `workflow_dispatch` al SHA anterior (ADR-0011), en orden inverso de fases. En emergencia, por CLI:
   `update-function-url-config` a `NONE` y recreación de los dos permisos públicos (`lambda:InvokeFunctionUrl` y
   `lambda:InvokeFunction` con `invoked-via-function-url`), seguida de reconciliación de drift por deploy. Estos comandos
   quedan preparados de antemano pero **no ensayados**.

## Consecuencias

- (+) Las Function URL dejan de ser invocables desde internet; el control de origen ya no depende solo de un secreto
  compartido, y el optimizador de imágenes queda cubierto por primera vez.
- (+) Búsquedas y audio siguen sin pasar por ninguna función intermedia.
- (−) **Riesgo residual:** la primera validación de POST contra IAM real ocurre en R3. Mitigación: verificación manual de un
  POST real justo después del deploy y reversión por CLI preparada, con su reconciliación de drift.
- (−) La disponibilidad de todo POST depende de código cliente propio, acoplado al comportamiento interno de Next. Cada
  actualización de Next debe repetir la prueba del interceptor.
- (−) **Se pierde el envío sin JavaScript.** La búsqueda ya lo requería por Turnstile; los demás formularios públicos y los
  de admin pasan a requerirlo.
- (−) Una pestaña anterior al release del interceptor recibe 403 en sus POST tras activar IAM, hasta recargar. Se acepta sin
  espera porque el sitio no se usa; si vuelve a usarse antes de R3, se reevalúa.
- (−) El smoke de CI solo hace GET: no detecta POST rotos.
- (−) Tras una reversión por CLI hay drift que CloudFormation no detecta; reconciliarla es obligatorio.
- (−) `/api/revalidate` cambia de contrato; un llamador externo con Bearer deja de funcionar desde R1.
- (−) **Desde R3, quien llame a `/api/revalidate` debe enviar `x-revalidate-token` y también `x-amz-content-sha256`.**
  CloudFront firma con `SIGV4_ALWAYS` y Lambda exige el hash del body. Con body vacío, el valor es el SHA-256 de la cadena
  vacía (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Sin ese header, la llamada recibe 403 antes de
  llegar a la app. Los llamadores fuera del navegador no pasan por el interceptor, así que deben agregarlo ellos.

## Alternativas consideradas

- Mantener `NONE` + `x-origin-verify` en el server: deja la URL invocable desde internet; el único control sería un secreto
  compartido.
- Lambda@Edge para calcular el hash: agrega infra en us-east-1, ve solo ~1 MB de body y haría pasar búsquedas y audio de
  pacientes por otra función.
- Lambda Web Functions: descartada por decisión humana junto con Lambda@Edge.
- Activar IAM y OAC en un solo release: CloudFormation actualiza la URL antes que la distribución y abre una ventana de 403.
