# 04-plan — 0027 Smoke post-deploy con más cobertura

## TAREAS
T-1 · ci · TDD: ON · estricto · económico · depende de: — · cubre: AC-1..AC-5 · terminado: `smoke.mjs` agrega `checkDynamicPage` (`/servicios`, 200 + texto estable) y `checkNotFound` (`/__smoke-no-existe`, 404) a `CHECKS`; `SMOKE_PATHS` igual a `["/", "/admin", "/servicios", "/__smoke-no-existe"]`; tests contra `node:http` local: 200 sin el texto falla, 500 falla, 200 en la ruta 404 falla, fallo imprime solo `ruta status intento`; el test de AC-29 de 0026 se actualiza a la lista nueva y sigue afirmando que no hay `/buscar` ni `/api` · archivos: [infra/scripts/ci/smoke.mjs, infra/test/ci-scripts.test.ts]

T-2 · docs · TDD: OFF · depende de: T-1 · cubre: AC-4 · terminado: `docs/ARCHITECTURE.md` §11 lista las 4 rutas del smoke y aclara que `/` sale de la caché de CloudFront · archivos: [docs/ARCHITECTURE.md]

## VERIFICACIÓN
`pnpm typecheck && pnpm lint && pnpm test` en verde; el smoke real se prueba en el próximo deploy.
