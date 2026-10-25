# 02-spec — 0028 Backlog de hardening del CI (B-1..B-12 de 0026)

## RESUMEN
- Cierra el backlog B-1..B-12 que dejó `docs/sdd/0026-ci-deploy-production/08-close.md`.
- Tres endurecimientos de `check-bundle.mjs` en modo `--tar-archive` (B-1..B-3), uno de un test de seguridad (B-9) y el resto higiene de tests y legibilidad.
- No cambia la app, el workflow ni lo que se despliega. Solo `infra/scripts/ci/check-bundle.mjs` y tests de `infra/test/`.
- Fuera: CI en PRs a `develop` (OP-5), cambios de comportamiento del deploy.

ESTADO: implementada

## OBJETIVO · ACTORES
Que el modo tar de `check-bundle` no dependa del escaneo posterior a la extracción para rechazar rutas y destinos de symlink engañosos, y que los tests del CI no dejen pasar errores por estar acoplados al código o a la redacción.
- Job `checks` y job `deploy`: corren `check-bundle.mjs`.

## CRITERIOS DE ACEPTACIÓN
- AC-1 (B-1) Given un tar con un miembro cuyo nombre tiene un segmento vacío en el medio (`.open-next//s/x`) When `--tar-archive` Then exit 1 con `entrada N del tar: ruta con segmentos vacíos`. La `/` final de los directorios sigue siendo válida.
- AC-2 (B-2) Given un tar.gz que descomprimido supera 512 MiB When `--tar-archive` Then exit 1 con `no se pudo leer el tar`, sin descomprimir más allá del límite.
- AC-3 (B-3) Given un symlink del tar cuyo destino, resuelto desde su directorio, pasa por otro symlink del mismo tar (`c -> .` y `a -> c/../x`) When `--tar-archive` Then exit 1 con `entrada N del tar: destino a través de un symlink`.
- AC-4 Given el `.open-next` real empaquetado con GNU tar When `--tar-archive` y `--extracted-root` Then exit 0 (los symlinks de pnpm no pasan por otros symlinks).
- AC-5 (B-4) Given un script de `infra/scripts/ci/` con `import "x"`, `export … from "x"` o `import("x")` When corre el guard de imports Then el especificador se valida igual que un `import … from`.
- AC-6 (B-9) Given el test del rol OIDC Then compara contra los 6 ARN escritos literalmente, no calculados.
- AC-7 (B-5) Given los greps de docs de `repo-hygiene.test.ts` Then usan una ventana acotada de caracteres en vez de `[^.]*`, y siguen en verde sobre los docs actuales.
- AC-8 (B-6, B-8) Given los tests de `ci-scripts.test.ts` Then los directorios temporales se borran en `finally` y `isolatedGitEnv` vive en un solo módulo compartido por `ci-scripts.test.ts` y `repo-hygiene.test.ts`.
- AC-9 (B-11) Given el test del comentario de `id-token` Then afirma que el comentario existe y no depende de una frase histórica.
- AC-10 (B-7, B-12) Given `repo-hygiene.test.ts` y `check-bundle.mjs` Then un comentario explica por qué los patrones de secretos están duplicados, y la tabla de registros pax no mezcla nombres de campo con marcadores.
- AC-11 (B-10) Given `08-close.md` de 0026 Then B-10 queda cerrado con la evidencia ya registrada en `05-apply-progress.md` y los runs exitosos del deploy.

## CASOS BORDE
- GNU tar escribe los directorios con `/` final: el chequeo de AC-1 ignora solo esa.
- AC-3 compara contra los symlinks del tar sin normalizar el destino primero; un destino que nombra directamente a otro symlink (cadena `a -> b`, `b -> real`) sigue permitido.
- Si AC-4 falla con el bundle real, AC-3 se reemplaza por documentar la dependencia del escaneo con `realpath` y se avisa antes de seguir.

## PRIVACIDAD
Sin cambios: los mensajes siguen listando solo índices de entrada o rutas, nunca contenido.
