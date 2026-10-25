# 08-close — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK)

## RESUMEN
- Entregado: workflow `deploy-production.yml` (resolve, checks, deploy), `EvzlaCiStack` (rol OIDC `evzla-github-deploy`), scripts `infra/scripts/ci/*.mjs`, Dependabot, CODEOWNERS, `.env.production` público, sección "Deploy" en `docs/ARCHITECTURE.md`.
- AC-1..AC-35 cubiertos según `06-verify.md` (tercera verificación sobre d2d3612, PASS con 1 FAIL externo: check 9, body-parser, fuera del diff). Tareas T-1..T-20.
- GATE 1 2026-10-22, CORRECCIONES 2 y 3 y GATE 2 2026-10-24 (token "firmado"), todos de Jorge Diaz, en `gates.md`.
- Merge: PR #120 a `develop` el 2026-10-24T20:40:43Z, merge commit `c0f30fd` (merge commit, no squash). Releases a `main`: #122 (`462d587`) y #125 (`b277aa8`).
- Suite al cierre (654c5b3): core 286, db 20, web 61, infra 263 (README actualizado a 630).
- Condición del GATE 2 cumplida: el override de body-parser entró a `main` con #122.
- Primer deploy: run `40225615580` sobre `b277aa8` (2026-10-25), aprobado en `Production`; OIDC asumió `evzla-github-deploy`, desplegó `EvzlaCertificateStack`, `EvzlaEmailStack` y `EvzlaStack`; smoke en verde (`/` 200, `/admin` 307 a `/admin/login`).
- Fix post-merge: el primer run (`40215231258`, `462d587`) falló en `checks` porque Next.js copia el `.env.production` versionado a `server-functions/default/apps/web/`. PR #124 (`4a7c324`): `check-bundle` lo acepta solo si es archivo regular con claves `NEXT_PUBLIC_` (regla compartida con `check-public-env` en `cli.mjs`). Suite tras el fix: infra 269.

## ADRs
- Aceptados (1): ADR-0011, firmado 2026-10-22 (ya figuraba ACEPTADO en `adr/0011-ci-cd-github-actions-oidc.md`; este cierre no lo tocó).
- Enmiendas propuestas (0). Pendientes de firma (0).
- Riesgos residuales aceptados en GATE 2 (registro, no ratificación nueva): `id-token: write` a nivel de job; outputs de EvzlaStack en log público; trust acepta cualquier workflow con `environment: Production`; rollback por dispatch revierte infra y scripts del SHA viejo; artifact `.open-next` descargable 1 día; `check-public-env` valida solo el prefijo; contención de extracción depende de defaults de GNU tar del runner.

## CAPACIDAD reconciliada
Ninguna. El repo no tiene `specs/<capacidad>/` ni `_archive/` (los `specs/NNNN-*.md` son por feature y el flujo SDD vive en `docs/sdd/<NNNN>-<slug>/`). La feature es tooling de entrega sin comportamiento de producto; el comportamiento duradero quedó en `docs/ARCHITECTURE.md` §11 y ADR-0011.

## ARCHIVADO en
No se movió: `docs/sdd/0026-ci-deploy-production/` queda en su lugar (ADR-0011 y README lo enlazan; el repo no usa `_archive/`). `02-spec.md` marcado `ESTADO: implementada (c0f30fd)`. Puntero `.git/sdd-current` borrado (no había `<raíz>/.current`).

## BACKLOG
Vive en la sección "Pendiente" de `README.md` (el repo no tiene archivo de backlog); el detalle va aquí. Cerrados por este PR: ninguno del backlog previo.

Nuevos, origen revisión/seguridad (todos baja salvo indicación; no bloquean). **Cerrados B-1..B-12 por 0028** (`docs/sdd/0028-ci-hardening-backlog/`); B-10 sin cambio de código: la evidencia ya estaba en `05-apply-progress.md` y los deploys por CI la confirmaron.
- B-1 N-3 (07-security): `goesThroughSymlink` no normaliza; `.open-next//s/x` evade la detección. Contenido hoy por `linkStaysInBundle` y los scans post-extracción. Fix: rechazar segmentos vacíos en `isBundleEntry`. PoC `doubleSlash` sigue en exit 0.
- B-2 N-4: `gunzipSync` sin `maxOutputLength` (DoS de memoria en el runner; falla cerrado).
- B-3 Destino léxico de symlinks en el tar (`check-bundle.mjs` `linkStaysInBundle`): `c -> .` + `a -> c/../x` pasa `--tar-archive`; hoy lo rechaza el scan por `realpath`. Rechazar destinos que pasen por otro symlink del tar, o documentar la dependencia.
- B-4 Guarda de imports de `ci-scripts.test.ts` solo reconoce `import … from`; faltan `import "x"`, `export … from`, `import("x")`.
- B-5 `[^.]*` como "misma oración" en los greps de `repo-hygiene.test.ts` (se corta en `p. ej.`, `v6.3.0`, dominios); usar `[\s\S]{0,200}` y `/i` uniforme.
- B-6 `rmSync(offline)` fuera de `finally` en `ci-scripts.test.ts` (~l.239).
- B-7 a B-10 (bajas que dejó T-17; lista reconstruida de `07-review.md`, 2ª pasada, "abiertos a propósito" + evidencia pendiente; el texto de `03-design` solo dice "las 4 bajas"): (a) comentario sobre la divergencia AC-33 en los patrones AKIA/PEM duplicados de `repo-hygiene.test.ts`; (b) `isolatedGitEnv` duplicado y `writeSummary` reimplementa `runScript` sin `try/finally`; (c) `expectedArns` espeja el `flatMap` en `ci-stack.test.ts` (listar los 6 ARN literales); (d) evidencia de `download-artifact` v8 (ruta `path/<archivo>`, README al SHA 9000827c) en `05-apply-progress.md` (T-16).
- B-11 Aserción de frase histórica en `ci-workflow.test.ts` (~l.334, `nunca corren con acceso a AWS`): acoplada a redacción.
- B-12 Legibilidad de `check-bundle.mjs` (3ª revisión): `PAX_NAME_RECORDS` registra pax `path` con `source: "L"` y `withName(..., "pax", true)` usa un campo que no es nombre; renombrar o separar. (Cerrados por T-20 según 05-apply-progress: media de pax, N-5..N-7, `expectRejected` de `cache.from`, tabla de progreso; sin verificación independiente del hash del último commit en este cierre.)

Nuevos, origen documentación (hecho en este cierre): `docs/ARCHITECTURE.md` §11 Rollback aclara que el dispatch revierte infra y scripts completos del SHA viejo.

Nuevos, origen riesgo residual / pendientes operativos (no son código de esta feature):
- OP-1 Hecho: override `body-parser@2` → `2.4.0` en `pnpm.overrides` (rama `chore/deps-body-parser-audit`), con excepción a la regla de 72 h autorizada por el humano el 2026-10-24 (publicado 2026-10-22T11:39Z, ~57 h; sin advisories sobre 2.4.0). `pnpm audit --audit-level=high` en verde.
- OP-2 Hecho: releases #122 y #125 a `main`.
- OP-3 Hecho salvo el paso 6 (opcional): `EvzlaCiStack` desplegado a mano el 2026-10-25 (output `DeployRoleArn` igual al literal del workflow); environment `Production` con reviewer `jorgeluisd` y solo `main`; primera corrida aprobada con el `sub` correcto. Pendiente opcional: `workflow_dispatch` con `ref` inválido.
- OP-4 Resuelto en el runner: el bundle real no trae hardlinks y GNU tar pasó `--tar-archive` y `--extracted-root`. Sigue vigente: el `git fetch` sin credenciales de `check-main-tip` depende de que el repo sea público.
- OP-5 Hecho: `resolve` y `checks` corren también en PRs a `develop`; `deploy` sigue limitado a push a `main`.
- OP-6 Dependabot `github-actions` con `target-branch: develop` (#126); `npm` sin `target-branch` para no perder las security updates.
- Mitigación futura: cuenta AWS propia (ADR-0011).

## MEMORIAS GUARDADAS
Guardadas en Engram desde la sesión principal: bundle como tarball por symlinks pnpm, parser de tar fail-closed frente a GNU tar, excepción 72 h de body-parser, `.env.production` copiado al bundle, primer deploy exitoso.

## PRÓXIMO PASO SUGERIDO
1. Opcional: paso 6 de `04-plan.md`.
