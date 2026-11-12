# 08-close — 0029 Function URL con AWS_IAM + OAC

## RESUMEN
- Entregado en tres releases: las Function URL de imágenes y server pasan de `NONE` a `AWS_IAM`, firmadas por CloudFront OAC (SigV4 always). `x-origin-verify` y `proxy.ts` se conservan.
- R1: PR #140, release #141 (`a657561`). Interceptor de `fetch` (hash del body), control de envío antes de hidratar, `x-revalidate-token`, OAC no-override.
- R2: PR #144, release #145 (`a4a4087`). Imagen a `AWS_IAM`: optimizada 200 por dominio, 403 directo a la Function URL.
- R3: PR #146, release #147 (`e0dcba3`, 2026-11-12). Server a `AWS_IAM`. Deploy run `43291876486` OK, con smoke que incluye POST firmado a `/api/revalidate` → 401.
- Verificado en producción (C3): ambas URLs `AWS_IAM` (`list/get-function-url-config`); directo al server GET y POST → 403; dominio 200; política del server con solo los 2 permisos de `cloudfront.amazonaws.com` acotados por `SourceArn`. El humano confirmó búsqueda y acción admin OK en el navegador.
- Evidencia: `06-verify.md`, `06-verify-r2.md`, `06-verify-r3.md` (PASS; R3 sobre 4e36edf, infra 325/325). Gates en `gates.md` (GATE 2 de R2 y R3 delegados al merge, 2026-11-11 y 2026-11-12, Jorge Diaz).
- PENDIENTE AC-M5: POST `/api/revalidate` con token válido (200; desde R3 con `x-amz-content-sha256`). Requiere leer el token (`evzla/app`) con OK humano; misma razón que M-4 de 0030.
- Tag de costos `project=encuentramevzla` activado en Billing el 2026-11-11.

## ADRs
- Aceptados (0). Enmiendas propuestas (0).
- Pendientes de firma (2): ADR-0012 (2026-11-09) y ADR-0013 siguen `PROPUESTO`. Decisión del humano; no se ratifican aquí.

## CAPACIDAD reconciliada
Ninguna. No existe `specs/<capacidad>/`; es endurecimiento de infraestructura sin comportamiento de producto nuevo. Lo duradero queda en ADR-0012 y `docs/ARCHITECTURE.md`.

## ARCHIVADO en
No se movió: queda en `docs/sdd/0029-function-url-oac/` (el repo no usa `_archive/`). `02-spec.md` marcado `ESTADO: implementada (e0dcba3)`. Puntero `.git/sdd-current` borrado si existía.

## BACKLOG
Vive en `README.md` ("Pendiente"). Origen: `06-code-review.md`, `06-review-r2.md`, `06-review-r3.md`, `06-security-review.md` (bajos al backlog por GATE 2) y avisos del orquestador. Cerrados: ninguno previo.
Bajos de revisión:
- C29-1 `content-hash-fetch.test.ts`: falta caso de `init.headers`/`signal`/`credentials` y de `Request` de entrada con `.clone()`; URL relativa se resuelve contra `deps.origin` y no `document.baseURI` (medios del code review de R1; verificar cierre en T-8 antes de dar por resuelto).
- C29-2 `hydrated-submit-guard`: no marca `input type=submit|image`; lista fija de archivos públicos (AC-14); riesgo de timeout de 5 s en disco lento.
- C29-3 `e2e/content-hash/run.mjs`: S6 no prueba concurrencia real; S5 no compara bytes; `eslint.config.mjs` ignora todo `e2e/**`.
- C29-4 Comentarios que narran el "qué" (`revalidate/route.ts:7`, `run.mjs:1-2`) y `as unknown as SubtleCrypto` en un test.
- C29-5 Interceptor: `Request` de otro realm no pasa `instanceof Request`.
- C29-6 R2: T6 no fija ausencia de `FunctionAssociations` en `_next/image*`; ventana de 403 durante propagación (aceptada).
- C29-7 R3: T4 no cubre un `*` sobre alias/version u otra función; `03-design.md:76` describe el T4 anterior; comentario de `open-next-site.ts:149-150` dice "el navegador" y también firman llamadores externos de revalidate.
- C29-8 `!==` en la comparación del token de revalidate (usar digest + `timingSafeEqual` como `origin-verify.ts`).
- C29-9 `/api/revalidate` sin rate limit; entropía de `REVALIDATE_TOKEN` no documentada.
- C29-10 Dictado sin tope de duración: más de 6 MB (~12 min a 64 kbps) falla sin mensaje claro (`cargar-client.tsx:173-185`, `lib/actions/voz.ts:80`).
- C29-11 Login admin antes de hidratar hace GET nativo con el email en la URL (queda en el historial); en `equipo-client.tsx:131-132` es el formulario de invitación.
Avisos del orquestador:
- A-1 `sharp` falla en `build:aws` local (flags de npm); en CI funciona.
- A-2 `@smithy/core@3.35.2` deprecado.
- A-3 Sin WAF, rate limit ni concurrencia reservada: solo la alerta de presupuesto (USD 5).
- A-4 El perfil `blockealo` usa credenciales root.
- A-5 Handler de `AwsCustomResource` en `nodejs24.x` frente a `nodejs22.x` de la app (ver C30-6).
- A-6 RDS y VPC compartidos sin el tag `project=encuentramevzla`.
- Condición vigente: NO activar logs de CloudFront con headers (llevarían `Authorization` y tokens).
Pendientes de verificación: AC-M5 y M-4 (token).

## MEMORIAS GUARDADAS
Engram (sin datos personales): OAC SigV4 exige hash del body en POST (interceptor de `fetch`); 403 directo a la Function URL como sonda; condición de no activar logs de CloudFront con headers.

## PRÓXIMO PASO SUGERIDO
1. Humano: decidir firma de ADR-0012 y ADR-0013 (hoy `PROPUESTO`).
2. Con OK humano, leer el token de `evzla/app` y cerrar AC-M5 y M-4 (POST `/api/revalidate` y sello "Actualizado" en 300 s o menos).
3. Candidatos de siguiente feature: C29-8/C29-9 (revalidate con `timingSafeEqual` y rate limit) y A-3 (WAF o concurrencia reservada). Leer antes `06-review-r3.md`, `06-security-review.md` de ambas features y `adr/0012`, `adr/0013`.
