# 0029 function-url-oac: apply progress

## RESUMEN ACUMULADO (archivado en 05-apply-progress-T1-T9b.md)

| Tarea | Estado | Commit | AC cubiertos |
|---|---|---|---|
| T-1 | terminada | 40657a4 | AC-1..AC-8 |
| T-2 | terminada | ec72bcc | AC-9 (vía T-8/T-9) |
| T-3 | terminada | 716f210 | AC-10, AC-11 |
| T-4 | terminada | 1533c23 | AC-12 |
| T-5 | terminada | 686b2e8 | AC-13, AC-14 |
| T-6 | terminada | ba6cad3 | AC-15..AC-18 |
| T-7 | terminada | b80812d | AC-19, AC-20 |
| T-8 | terminada | aed1b9d | AC-9..AC-12 (C1) |
| T-9b | terminada | aa0dd96 | M1..M4 de 06-code-review.md |

## R2 — Function URL de imágenes a AWS_IAM + SIGV4_ALWAYS

> Las corridas de `evzla-stack.test.ts` y de los checks globales pasan a background (> 180 s o por lentitud del disco), así que el hook las registra `exit=? · WARN=backgrounded`. La salida literal de cada una está en `docs/sdd/0029-function-url-oac/bg-runs/<timestamp-log>-*.log` (local, gitignored por `*.log`); el timestamp del nombre es el de la línea del log.

## T-11 — URL de imágenes AWS_IAM y OAC always   estado: terminada
TDD: ON (infrastructure CDK; se cambió primero `EXPECTED` de la imagen y falló)
Safety net: `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts --reporter=dot` → `Test Files 1 passed (1) · Tests 41 passed (41)`, exit 0 (2026-11-11T21:30:56Z, `WARN=backgrounded`; bg-runs/2026-11-11T21-30-56Z-T11-safety-net-stack.log)
Archivos tocados: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`   Desviaciones respecto al plan: ninguna

TDD Cycle Evidence (comando: `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts --reporter=dot`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | T1 image AuthType · T2 OAC por URL (AC-19/AC-21) · T4 permisos `*` de la imagen | ídem, con `EXPECTED.image = { authType: "AWS_IAM", signing: "always" }` | FAIL — `expected 'NONE' to be 'AWS_IAM'`; `- "SigningBehavior": "always" / + "SigningBehavior": "no-override"`; T4 `expected true to be false` · Tests 3 failed \| 38 passed (41), exit 1 (bg-runs/2026-11-11T21-33-03Z-T11-red.log, `WARN=backgrounded`) | 2026-11-11T21:33:03Z |
| GREEN | archivo completo | ídem, tras `FunctionUrlAuthType.AWS_IAM` y `Signing.SIGV4_ALWAYS` solo en la imagen | PASS — Test Files 1 passed (1) · Tests 41 passed (41), exit 0 (bg-runs/2026-11-11T21-34-10Z-T11-green.log, `WARN=backgrounded`) | 2026-11-11T21:34:10Z |
| TRIANGULATE | — | — | no aplica: T1/T2/T4 ya cubren server e imagen por `it.each`; el server sigue NONE + no-override en la misma corrida | — |
| REFACTOR | — | — | sin cambios tras GREEN | — |

Confirmación T4 / T3: en el GREEN pasa `keeps public (*) permissions on the image function only while its URL is NONE (T4)` con `EXPECTED.image.authType = "AWS_IAM"`, o sea, ya no hay `AWS::Lambda::Permission` con principal `*` sobre la imagen; la del server sigue teniéndolos (NONE). `lets only this distribution invoke the image URL through CloudFront (T3, AC-20)` sigue verde: `InvokeFunctionUrl` e `InvokeFunction` (`InvokedViaFunctionUrl: true`) de `cloudfront.amazonaws.com`, ambos con `SourceArn` a la distribución y sin `*`. AC-23 (L301, `x-origin-verify` solo en el server), AC-24 (T6 y L120) y el bloque 0030 (`HtmlInvalidation`, `MaxTTL` 300) verdes sin tocar.
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `infra` → `tsc=0`) · lint ✔ (`pnpm exec eslint lib/open-next-site.ts test/evzla-stack.test.ts` → `eslint=0`, en background) · tests ✔ (41 passed, 2026-11-11T21:34:10Z)
Commit: 5d5b81d fix(infra): require IAM auth on the image function URL
Decisiones menores: ninguna; solo los 2 literales de la imagen y la línea de `EXPECTED`.
Notas para el verifier: el comentario sobre `serverUrl` (OAC NO_OVERRIDE sobre URLs NONE) queda impreciso para la imagen desde R2; el plan reserva su cambio a R3 (T-14) y no se tocó. El guardrail post-escritura volvió a avisar de `no-reply@encuentramevzla.com` en el test: preexistente (ver T-7). Nada contra AWS: sin `cdk diff`/`deploy` (T-13 es manual).

## T-12 — verificación de R2   estado: terminada
TDD: OFF (tarea de verificación, sin archivos)
Checks:
- `pnpm lint` → `Tasks: 5 successful, 5 total`, exit 0 · `pnpm typecheck` → `Tasks: 5 successful, 5 total`, exit 0 (bg-runs/T12-lint-typecheck.log; no los registra el hook)
- `pnpm test` → `Tasks: 4 successful, 4 total`; core `Tests 286 passed (286)`, db `20 passed (20)`, web `107 passed (107)`, infra `318 passed (318)`, exit 0 (2026-11-11T21:46:14Z, `WARN=backgrounded`; bg-runs/2026-11-11T21-46-14Z-T12-pnpm-test.log)
- `pnpm build` → `Tasks: 1 successful, 1 total`, exit 0 (bg-runs/T12-pnpm-build.log)
Alcance: `git diff --name-only develop...HEAD` → `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts` (más este archivo en el commit de docs).
Commit: el de este registro (docs).

## R3 — Function URL del server a AWS_IAM + SIGV4_ALWAYS

> Las corridas de `evzla-stack.test.ts` de T-14 bajaron a ~20 s, así que RED, GREEN y REFACTOR van en primer plano con `exit` real en el log; el safety net, C1 y los checks globales fueron en background y su salida literal está en `bg-runs/` (local, gitignored por `*.log`).

## T-14 — URL del server AWS_IAM y OAC always   estado: terminada
TDD: ON (infrastructure CDK; se cambió primero `EXPECTED.server` y falló)
Safety net: `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts --reporter=dot` → `Test Files 1 passed (1) · Tests 41 passed (41)`, exit 0 (2026-11-12T18:38:46Z, `WARN=backgrounded`; bg-runs/2026-11-12T18-38-46Z-T14-safety-net-stack.log)
Archivos tocados: `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`   Desviaciones respecto al plan: ninguna de archivos; dentro del test se reescribió T4 (ver REFACTOR)

TDD Cycle Evidence (comando: `pnpm --filter @evzla/infra test -- test/evzla-stack.test.ts --reporter=dot`)
| Fase | Test | Comando | Resultado | Timestamp-log |
|---|---|---|---|---|
| RED | T1 server AuthType · T2 OAC por URL (AC-19/AC-22) · T4 permisos `*` del server | ídem, con `EXPECTED.server = { authType: "AWS_IAM", signing: "always" }` | FAIL — `expected 'NONE' to be 'AWS_IAM'`; `- "SigningBehavior": "always" / + "SigningBehavior": "no-override"`; T4 `expected true to be false` · `Failed Tests 3 · Test Files 1 failed (1) Tests 3 failed \| 38 passed (41)`, exit 1 | 2026-11-12T18:39:58Z |
| GREEN | archivo completo | ídem, tras `FunctionUrlAuthType.AWS_IAM` y `Signing.SIGV4_ALWAYS` en el server y el comentario nuevo | PASS — `Test Files 1 passed (1) Tests 41 passed (41)`, exit 0 | 2026-11-12T18:40:38Z |
| TRIANGULATE | — | — | no aplica: T1/T2/T3/T4 corren por `it.each` sobre server e imagen | — |
| REFACTOR | T4 → `grants no public (*) permission on the %s function (T4, AC-22)` | ídem | PASS — `Test Files 1 passed (1) Tests 41 passed (41)`, exit 0 | 2026-11-12T18:42:38Z |

REFACTOR: tras GREEN, `tsc --noEmit` en `infra` falló con `TS2367` en T4 (`EXPECTED[name].authType === "NONE"` ya no puede ser cierto con ambos literales en `AWS_IAM` bajo `as const`). T4 pasa a afirmar AC-22 directamente: `expect(publicPermissions).toHaveLength(0)` para server e imagen.
Confirmación AC-22..AC-25: T1 (ambas `AuthType: AWS_IAM`), T2 (ambos OAC lambda `SigningBehavior: always`, 3 OAC en total), T4 (0 `AWS::Lambda::Permission` con principal `*` sobre server e imagen) y T3 (`InvokeFunctionUrl` + `InvokeFunction` de `cloudfront.amazonaws.com` con `SourceArn` a la distribución, sin `*`) verdes. AC-23 (L301, `x-origin-verify` solo en el server), AC-24 (T6 y L120) y el bloque 0030 (`HtmlInvalidation`, `MaxTTL` 300) verdes sin tocar. AC-25: el comentario ya no habla de URLs NONE; dice que ambas URL exigen IAM y que los POST llevan `x-amz-content-sha256` calculado en el navegador (ADR-0012).
Checks locales: typecheck ✔ (`pnpm exec tsc --noEmit` en `infra` → `tsc=0`) · lint ✔ (`pnpm exec eslint lib/open-next-site.ts test/evzla-stack.test.ts` → `eslint=0`) · tests ✔ (41 passed, 2026-11-12T18:42:38Z)
Commit: 03cb307 fix(infra): require IAM auth on the server function URL
Decisiones menores: nombre nuevo de T4 (incluye AC-22).
Notas para el verifier: el guardrail post-escritura volvió a avisar de `no-reply@encuentramevzla.com` en el test: preexistente (ver T-7/T-11). Nada contra AWS: sin `cdk diff`/`deploy` (T-18 es manual).

## T-15 — contrato de `/api/revalidate` en ADR-0012   estado: terminada
TDD: OFF (confirmación documental, sin archivos)
`adr/0012-function-url-aws-iam-oac.md:57` ya dice: "Desde R3, quien llame a `/api/revalidate` debe enviar `x-revalidate-token` y también `x-amz-content-sha256`." No requiere edición.

## T-16 — C1 sobre el commit de R3   estado: terminada
TDD: OFF (harness de verificación)
`pnpm --filter @evzla/web test:content-hash` sobre 03cb307 (navegadores ya instalados: chromium-1254, webkit-2388, firefox-1572) → S1..S6 `PASS` en chromium, webkit y firefox; última línea `content-hash C1: PASS`, exit 0 (2026-11-12T18:43:45Z, `WARN=backgrounded`; bg-runs/2026-11-12T18-43-45Z-T16-content-hash-c1.log)

## T-17 — verificación de R3   estado: terminada
TDD: OFF (tarea de verificación, sin archivos)
- `pnpm lint` → `Tasks: 5 successful, 5 total`, `lint=0` · `pnpm typecheck` → `Tasks: 5 successful, 5 total`, `typecheck=0` (bg-runs/T17-lint-typecheck.log; no los registra el hook)
- `pnpm test` → `Tasks: 4 successful, 4 total`; core `Tests 286 passed (286)`, db `20 passed (20)`, web `107 passed (107)`, infra `318 passed (318)`, exit 0 (2026-11-12T18:47:31Z, `WARN=backgrounded`; bg-runs/2026-11-12T18-47-31Z-T17-pnpm-test.log)
- `pnpm build` → `Tasks: 1 successful, 1 total`, exit 0 (bg-runs/T17-pnpm-build.log)
Alcance: `git diff --name-only develop...HEAD` → `infra/lib/open-next-site.ts`, `infra/test/evzla-stack.test.ts`, más `05-apply-progress*.md` (rotación y este registro).
Pendiente humano: T-18 (`cdk diff` de R3) y los requisitos C2, C3, C4 antes de aprobar.
