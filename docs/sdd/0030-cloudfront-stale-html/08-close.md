# 08-close — 0030 HTML viejo en CloudFront

## RESUMEN
- Entregado: invalidación `/*` dentro del `cdk deploy` (A1, `HtmlInvalidation` con `CallerReference` = build id) y `maxTtl` de `ServerCachePolicy` de 31536000 a 300 s (B1); el smoke compara el build id servido con el desplegado.
- Cubre AC-1..AC-9 según `06-verify.md` (PASS, sha d64c80c). GATE 1 y GATE 2 2026-11-11 (token "acepto"), Jorge Diaz, en `gates.md`.
- Merge: PR #142 a `develop`; release #143 a `main` (`39a4bb0`).
- Deploy: run `43101434316` OK. Invalidación automática `I1Z7FMYKUU9YGJ7C2MHA22S4YT`, con `CallerReference` igual al build id servido.
- Verificación manual post-deploy: M-1 OK (búsqueda, humano). M-2 OK (chunk del interceptor presente en el HTML). M-3 OK (Miss a Hit, age 10, con `Accept` de navegador).
- M-4 PENDIENTE: `POST /api/revalidate` y sello "Actualizado" nuevo en 300 s o menos. Requiere leer el token de revalidación (Secrets Manager `evzla/app`) y necesita OK explícito del humano. Se resuelve junto con AC-M5 de 0029.
- Precondición de 0029 R3 cumplida (R3 ya desplegada, ver `0029-function-url-oac/08-close.md`).

## ADRs
- Aceptados (0). Enmiendas propuestas (0).
- Pendientes de firma (1): ADR-0013 sigue `PROPUESTO` (2026-11-11). Decisión del humano; este cierre no lo ratifica. El GATE 2 aprobó el código, no firmó el ADR.

## CAPACIDAD reconciliada
Ninguna. No existe `specs/<capacidad>/`; es infraestructura/CI sin comportamiento de producto nuevo. El comportamiento duradero queda en ADR-0013 y `docs/ARCHITECTURE.md`.

## ARCHIVADO en
No se movió: `docs/sdd/0030-cloudfront-stale-html/` queda en su lugar (el repo no usa `_archive/`, igual que 0026-0028). `02-spec.md` marcado `ESTADO: implementada (39a4bb0)`. Puntero `.git/sdd-current` borrado si existía; no hay `<raíz>/.current`.

## BACKLOG
Vive en `README.md` ("Pendiente"); el detalle, aquí. Origen: `06-code-review.md` y `06-security-review.md`, bajos pasados al backlog en GATE 2 (obs. 1). El alto y los medios del code review se corrigieron en T-8/T-8b.
Cerrados: ninguno del backlog previo.
Nuevos (todos baja, no bloquean):
- C30-1 Comentario de `open-next-output.ts:47` dice que el id viaja "a los logs del smoke"; el smoke no lo imprime.
- C30-2 `SMOKE_PATHS = Object.keys(checksFor(""))` usa un id ficticio; extraer una constante con la lista de rutas.
- C30-3 Regex `^[A-Za-z0-9_-]{1,64}$` duplicada entre `smoke.mjs` y `open-next-output.ts`; falta referencia cruzada.
- C30-4 Regex del build id toma la primera aparición de `"b":"..."`; si aparece un prop previo da falsos rojos (anclar a la fila RSC `0:{`).
- C30-5 Tests de `evzla-stack.test.ts:498,597` localizan el handler por regex `AWS[0-9A-Za-z]+` y exigen un único `Custom::AWS`; filtrar por `createInvalidation` y resolver con `Fn::GetAtt`.
- C30-6 Handler singleton de `AwsCustomResource` en `nodejs24.x` frente a `NODEJS_22_X` del sitio; constatar o uniformar.
- C30-7 (security) Rollback tras invalidar no re-invalida: el HTML nuevo queda hasta 300 s contra el Lambda viejo (409/403 en Server Actions). Aceptado; runbook de invalidación manual en el diseño.
- C30-8 (security) El rol del handler lleva `AWSLambdaBasicExecutionRole` (logs sobre `*`); opcional: rol propio acotado a `HtmlInvalidationLogs`.
- C30-9 (security, latente) Singleton compartido: otro `AwsCustomResource` heredaría `cloudfront:CreateInvalidation`. Mitigado por el test que exige un único `Custom::AWS`.
- C30-10 Reintentos del smoke: 18 aplican a todo fallo de HTML, no solo a "build id distinto" (decisión explícita pendiente de documentar).
- C30-11 Pendiente M-4 (ver RESUMEN).
Avisos transversales (sin WAF/rate limit, tag de costos, logs de CloudFront): ver `0029-function-url-oac/08-close.md`.

## MEMORIAS GUARDADAS
Engram (sin datos personales): el smoke debe usar el `Accept` de navegador porque `accept` está en la clave de caché; rollback no re-invalida.

## PRÓXIMO PASO SUGERIDO
Ver `0029-function-url-oac/08-close.md` (cierre de M-4/AC-M5 con el token, firma de ADR-0012/0013).
