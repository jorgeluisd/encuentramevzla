# 02-spec — 0027 Smoke post-deploy con más cobertura

## RESUMEN
- El smoke de 0026 solo prueba `/` y `/admin`. `/` es `force-static` y CloudFront la sirve desde caché (`x-cache: Hit from cloudfront`), así que no prueba que la Lambda nueva responda.
- Se agregan dos chequeos de solo lectura: `/servicios` (`force-dynamic`, renderiza en la Lambda) y una ruta inexistente que debe dar 404.
- Sigue prohibido tocar el buscador, `/api/*` o cualquier ruta que escriba en `search_log` o mande correos.
- Fuera: probar contra el dominio `*.cloudfront.net`, POST a cualquier endpoint, chequeo de salud de la base.

ESTADO: implementada

## OBJETIVO · ACTORES
Que el job `deploy` falle si la Lambda desplegada no renderiza una página dinámica o no devuelve 404 donde corresponde, sin efectos en datos.
- Workflow (`deploy-production.yml`): corre `smoke.mjs` tras `cdk deploy`.

## CRITERIOS DE ACEPTACIÓN
- AC-1 Given deploy exitoso When `GET /servicios` sin seguir redirecciones Then 200 y el cuerpo contiene `Ayuda gratuita tras el sismo`.
- AC-2 Given lo anterior When `GET /__smoke-no-existe` Then 404.
- AC-3 Given cualquier chequeo con 5 intentos fallidos Then el job termina rojo e imprime `ruta status intento`, nunca el cuerpo (igual que AC-28 de 0026).
- AC-4 Given el smoke Then solo hace GET a `/`, `/admin`, `/servicios` y `/__smoke-no-existe`; nunca a `/buscar`, `/api/*` ni RPC. Enmienda AC-29 de 0026. [STATIC: `SMOKE_PATHS`]
- AC-5 Given los chequeos de 0026 (`/` 200 con título, `/admin` 3xx a `/admin/login`) Then siguen iguales.

## CASOS BORDE
- `/servicios` traga errores de la base y responde 200 con la lista vacía: el chequeo prueba la Lambda, no la base. Se deja explícito, no se cambia la página.
- La ruta 404 no debe existir nunca; el prefijo `__smoke-` no choca con rutas del App Router.

## PRIVACIDAD
`/servicios` solo lee servicios publicados (públicos). Ninguna ruta del smoke escribe en `search_log`, `sensitive` ni envía correo.
