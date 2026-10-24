# 08-close — 0026 CI/CD a producción (GitHub Actions + OIDC + CDK)

## RESUMEN
- Entregado: workflow `deploy-production.yml` (resolve, checks, deploy), `EvzlaCiStack` (rol OIDC `evzla-github-deploy`), scripts `infra/scripts/ci/*.mjs`, Dependabot, CODEOWNERS, `.env.production` público, sección "Deploy" en `docs/ARCHITECTURE.md`.
- AC-1..AC-35 cubiertos según `06-verify.md` (tercera verificación sobre d2d3612, PASS con 1 FAIL externo: check 9, body-parser, fuera del diff). Tareas T-1..T-20.
- GATE 1 2026-10-22, CORRECCIONES 2 y 3 y GATE 2 2026-10-24 (token "firmado"), todos de Jorge Diaz, en `gates.md`.
- Merge: PR #120 a `develop` el 2026-10-24T20:40:43Z, merge commit `c0f30fd` (merge commit, no squash). `main` sigue en 4a8128f: el deploy aún no corrió.
- Suite al cierre (654c5b3): core 286, db 20, web 61, infra 263 (README actualizado a 630).
- Condición del GATE 2: el primer deploy espera el override de body-parser en `main`.

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

Nuevos, origen revisión/seguridad (todos baja salvo indicación; no bloquean):
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
- OP-2 Release `develop` → `main`; el primer deploy espera que el override esté en `main`.
- OP-3 Pasos manuales 1 a 6 de `04-plan.md` (deploy a mano de `EvzlaCiStack`, environment `Production` con reviewer y solo `main`, primera corrida y verificación del `sub`).
- OP-4 Dudas abiertas: hardlinks en `.open-next` (`nlink > 1`) podrían hacer fallar `checks` si OpenNext los preserva; el `git fetch` sin credenciales de `check-main-tip` depende de que el repo sea público; GNU tar del runner no se probó localmente (solo bsdtar).
- Mitigación futura: cuenta AWS propia (ADR-0011).

## MEMORIAS GUARDADAS
Ninguna: las herramientas de Engram (`mem_save`) no estaban disponibles en esta sesión. Candidatas pendientes de guardar:
- Parser de tar propio en CI: reglas de fidelidad frente a GNU tar y defensa por extracción.
- upload/download-artifact rompen symlinks pnpm: el bundle viaja como tarball.
- Regla de madurez de 72 h bloquea overrides recientes (body-parser 2.4.0).

## PRÓXIMO PASO SUGERIDO
1. Mergear a `develop` el PR con el override de body-parser y este cierre.
2. Release `develop` → `main` con ese override incluido.
3. Antes del primer deploy, el humano ejecuta los pasos manuales 1 a 6 de `docs/sdd/0026-ci-deploy-production/04-plan.md` (cuenta AWS 934106163170, `cdk deploy EvzlaCiStack`, environment `Production`).
4. Primer run en `main`: aprobar, verificar `sub` OIDC, smoke y, si falla `checks` por hardlinks, abrir fix (OP-4).
5. Leer antes: `gates.md`, `07-security.md` (N-1..N-4), `docs/ARCHITECTURE.md` §11.
6. Después: tanda de higiene con B-1..B-12 (una sola feature pequeña, TDD).
