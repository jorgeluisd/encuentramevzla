# 0029 · R2 (URL de imagen en AWS_IAM + OAC SIGV4_ALWAYS) — revisión de seguridad y código

Diff: `develop...HEAD` (rama `feat/0029-r2-image-iam`). Evidencia: `pnpm --filter @evzla/infra test -- --reporter=dot test/evzla-stack.test.ts` → 41/41 verdes.

RESUMEN: 0 crítico · 0 alto · 0 medio · 2 bajo · riesgo residual: aceptable

## Verificaciones pedidas

| Punto | Resultado | Evidencia |
|---|---|---|
| URL de imagen sin permisos con principal `*` | Sí. `AWS_IAM` hace que CDK no emita los permisos públicos; T4 lo afirma por función (`length > 0` solo si NONE) | `infra/lib/open-next-site.ts:155`, `infra/test/evzla-stack.test.ts:409-412` |
| `InvokeFunctionUrl` + `InvokeFunction` (`invokedViaFunctionUrl`) de `cloudfront.amazonaws.com` acotados por `SourceArn` | Sí, uno de cada, con SourceArn a la distribución y sin comodín | `open-next-site.ts:260-267`, test `:395-407` |
| Server sigue en NONE / no-override (R3) | Sí | `open-next-site.ts:152,160`, test `:318` |
| Rutas de imagen sin POST/body | Sí. El behavior `imageOptimizer` solo permite GET/HEAD/OPTIONS; ALWAYS no requiere `x-amz-content-sha256` del navegador | `open-next-site.ts:225` |
| Headers reenviados no rompen la firma | Sí. El behavior `_next/image*` usa la managed policy `AllViewerExceptHostHeader` (la recomendada por AWS para OAC de Lambda URL): `Host` no se reenvía, CloudFront firma con el host del origen. Con ALWAYS CloudFront sobrescribe cualquier `Authorization` del viewer. No hay CloudFront Function que reescriba `host` en este behavior (`forwardHost` solo está en `serverBehavior`) | `open-next-site.ts:214-229`, test T6 `:423-429` |

## Hallazgos

| Sev | Hallazgo | Archivo:línea | Escenario | Recomendación |
|---|---|---|---|---|
| Bajo | Ventana de 403 en imágenes durante el deploy: CloudFormation cambia `AuthType` de la URL y el `SigningBehavior` del OAC en el mismo update; hasta que la distribución propaga (minutos), los edges con config vieja (NO_OVERRIDE) siguen firmando, así que en principio funcionan, pero cualquier petición con `Authorization` del viewer pasaría sin firmar CloudFront y daría 403 | `open-next-site.ts:155,165` | Imágenes rotas puntuales durante la propagación | Aceptar; tras el deploy, smoke `GET /_next/image?...` vía dominio → 200 y directo a la Function URL → 403 (según `05-apply-progress.md`/runbook) |
| Bajo | T6 comprueba el id de la managed policy, no que `host` no viaje; si alguien sustituye por una policy custom que incluya `host`, el test falla (bien), pero no cubre una CloudFront Function futura en `_next/image*` que reescriba `host` | `evzla-stack.test.ts:423-429` | Regresión que invalidaría la firma (403) | Opcional: afirmar que el behavior de imagen no tiene `FunctionAssociations` |

## Calidad de los tests
Prueban comportamiento a nivel de plantilla sintetizada (AuthType por función, OAC por origen, permisos por principal/acción/SourceArn, ausencia de `*`), localizando recursos por relación (env var → función → URL → origen → OAC) en vez de logical ids frágiles. La tabla `EXPECTED` hace que R3 sea un cambio de una línea en el test. Correcto.

## AMENAZAS DEL DISEÑO (alcance R2)
- Invocación directa de la URL de imagen saltando CloudFront → implementada sí (AWS_IAM) · test sí (T1, T4).
- Otra distribución/cuenta usando el OAC → implementada sí (SourceArn) · test sí (T3).
- Server directo vía URL → pendiente R3 (fuera de alcance, sigue mitigado por `x-origin-verify`).

## RIESGO RESIDUAL
Ningún test de síntesis prueba la firma real contra AWS; la validación es el smoke post-deploy. Aceptable.

## Veredicto
APROBADO para GATE 2 de R2. Sin crítico/alto.
