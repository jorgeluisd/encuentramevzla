# 0030 cloudfront-stale-html — verify

RESUMEN: PASS (0 checks en FAIL)
sha verificado: d64c80c9f7e686064b7736ae74673b57cb975d5a
Diff: 59b4b63..HEAD (rama fix/0030-cloudfront-stale-html)

| # | Check | Resultado | Última línea de salida |
|---|---|---|---|
| 1 | Typecheck | PASS | `pnpm exec turbo run typecheck --force` → `Tasks: 5 successful, 5 total · Cached: 0 cached, 5 total`, exit 0 |
| 2 | Lint + boundaries | PASS | `pnpm lint --force` → `Tasks: 5 successful, 5 total · Cached: 0 cached, 5 total · Time: 9m10.953s`, exit 0; sin `boundaries/*`; ejecución real (0 cached) |
| 3 | Tests unit + handler | PASS | `pnpm exec turbo run test --force` (0 cached, exit 0): core 53 files/286 tests, db 4/20, web 19/107, infra 7 files/316 tests. Sin `.skip/.only/.todo` nuevos en el diff |
| 4 | Integración | N/A | El diff no toca repos, esquema, migraciones ni aislamiento de datos (solo infra CDK, smoke, workflow, un comentario) |
| 5 | Evidencia TDD | PASS con notas | Ver abajo |
| 6 | Alcance | PASS | Archivos del diff = T-1..T-5 (open-next-output.ts/test, open-next-site.ts, evzla-stack.test.ts, page.tsx, smoke.mjs, ci-scripts.test.ts, deploy-production.yml, ci-workflow.test.ts) + 05-apply-progress.md. `ci-stack.test.ts` sin diff (AC-7). Sin archivos sorpresa |
| 7 | Criterios de aceptación | PASS | AC-1..AC-11 cubiertos por tests nombrados (describe "HTML invalidation on deploy", "server cache policy", "smoke.mjs", ci-workflow AC-8, ci-stack sin diff para AC-7); infra 316/316 en verde |
| 8 | Migraciones | N/A | Sin DDL ni migraciones de BD |
| 9 | Seguridad mecánica | PASS | `pnpm audit --audit-level high` → `4 vulnerabilities found · Severity: 4 moderate`, exit 0 (ninguna high). Grep de secretos en el diff (sk-, eyJ, AKIA, postgres://) sin coincidencias; sin `.env*` en el diff |
| 10 | Invariantes del proyecto | PASS | Sin cambios en core, db, buscador, ni schema `sensitive`; el smoke solo hace GET sin `/api` ni buscador (AC-11) y no imprime cuerpo ni id (tests). Sin skill local de invariantes que correr |
| 11 | Convención de entrega | PASS | 6 commits (a785a21..d64c80c) formato `tipo(scope): …`, autor Jorge Diaz, sin trailers de IA |
| 12 | Configuración faltante | PASS | `pnpm typecheck/lint/test/build` declarados en CLAUDE.md §5-§7. `<test:integration>` no necesario (check 4 N/A) |
| B | Build (`pnpm build`) | PASS | `turbo run build --force` → `Tasks: 1 successful, 1 total · Cached: 0 cached · Time: 12m57.468s`, exit 0 |
| S | `cdk synth --ci --quiet` (local) | PASS | exit 0. Verificación de plantilla abajo |

## Check 5 — evidencia TDD
- T-1 (open-next-output): RED `exit=1` 13:23:23Z (9 failed) → GREEN `exit=0` 13:23:46Z. Válido.
- T-4 (smoke): RED `exit=1` 13:46:38Z → GREEN `exit=0` 13:47:44Z. Válido.
- T-5 (workflow): RED `exit=1` 13:54:54Z → GREEN `exit=0` 13:55:49Z. Válido.
- T-2 y T-3 (`evzla-stack.test.ts`): las líneas del log son `exit=? WARN=backgrounded` (13:41:45Z, 13:43:10Z, 13:59:18Z, 14:02:53Z, 14:08:44Z) y por regla no cuentan como evidencia del hook. Se cotejó con `bg-runs/*.log`: salida literal del runner coherente con el apply-progress (T2-red: `1 failed | 1 passed | 31 skipped (33)`, `MaxTTL 300` vs `31536000`; T2-green: `33 passed`; T3-red: `5 failed | 3 passed | 33 skipped (41)` sobre cinco tests de HTML invalidation; T3 intento 1: `2 failed | 39 passed` por regex del test, producción sin cambios; T3-green: `41 passed (41)`). Además esta verificación re-ejecutó el archivo completo en verde desde cero (infra 316/316, 0 cached), de modo que el GREEN queda corroborado de forma independiente. Aceptable como respaldo, con la salvedad de que los logs de bg-runs son locales (gitignored) y el RED de T-2/T-3 solo se apoya en ellos, no en el hook.
- Línea `2026-11-11T14:28:55Z … pnpm test > scratchpad …; echo` (backgrounded) es de T-6 (TDD OFF), no cuenta ni se necesita.

## Plantilla sintetizada (`infra/cdk.out/EvzlaStack.template.json`)
- `Custom::AWS`: exactamente 1 (`SiteHtmlInvalidation669774EE`), `action: createInvalidation`, `Paths ["/*"]`, `CallerReference: evzla-n4h-B58rWjAk4_H_n_8Yl`. BUILD_ID de `apps/web/.open-next/assets/BUILD_ID` = `n4h-B58rWjAk4_H_n_8Yl` → coincide. `Create` == `Update`.
- DependsOn incluye ServerFunction, VersionedAssets, UnversionedAssets, CacheSeed y TagCacheInit.
- Policy: una sola sentencia con `cloudfront:CreateInvalidation`, Resource = `arn:<partition>:cloudfront::934106163170:distribution/<Ref SiteDistribution>` (acotada a la distribución).
- `SiteServerCachePolicy`: `DefaultTTL 0`, `MaxTTL 300`, `MinTTL 0`. (`SiteImageCachePolicy` mantiene 31536000, sin cambios.)

## GAPS de configuración del proyecto
- CLAUDE.md no tiene sección "Comandos" con `<test:integration>`, `<audit>` ni boundaries separados; los comandos se infirieron de §5-§7 y la instrucción del encargo. No bloquea (el diff no los necesita).
- Sin gitleaks instalado/usado; el grep de secretos fue por patrones.

## INCONSISTENCIAS DEL HOOK
Ninguna (no hay líneas `exit≠0` con resumen en verde).

## NOTAS PARA EL GATE 2
- Las corridas con `WARN=backgrounded` (T-2/T-3) se aceptan por cotejo con bg-runs y re-ejecución; decisión humana si se exige RED con hook.
- `pnpm audit`: 4 moderadas preexistentes, ninguna high; no introducidas por el diff.
- El handler singleton de AwsCustomResource corre `nodejs24.x` (default de CDK 2.272), no 22; el rol de CI y el rol del server no cambian.
- T-7 (`cdk diff` contra AWS) queda como paso manual del orquestador/humano; no se ejecutó (sin llamadas AWS).
- Aparecen sin trackear `06-code-review.md` y `06-security-review.md` en el directorio de la feature (de los otros revisores) y los archivos ajenos indicados; ninguno tocado.
- La plantilla sintetizada incluye el account id de la cuenta en el ARN (artefacto de synth en `cdk.out`, no versionado en el diff).
- `build:aws` del web (T-6 del plan) no se reejecutó; el BUILD_ID existente (generado el 2026-11-11 11:56) se usó para el synth.
