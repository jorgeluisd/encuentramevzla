# 0029 function-url-oac: gates

## GATE 1 — diseño

GATE 1 · 2026-11-09 · Jorge Diaz · APROBADO · token: "acepto" · alcance: T-1..T-18 (R1, R2, R3).

- Fecha: 2026-11-09
- Quién: humano (dueño del proyecto)
- Veredicto: APROBADO
- Token: `acepto`
- Alcance aprobado: 02-spec.md, 03-design.md, 04-plan.md, tabla de amenazas y ADR-0012 en estado PROPUESTO (no ratificado).
- Observaciones:
  1. Se aprueba `playwright` 1.65.0 como devDep exacta de `apps/web`, solo para la prueba local C1.
  2. Llamadores externos de `/api/revalidate` (C5): el humano no los conoce. Se aplica el fallback de la propuesta: R1 sigue y el impacto se limita al sello "Actualizado" de la home.
  3. T-5 (guarda AST + migración de los 15 formularios) va como una sola tarea.
  4. Decisiones previas vigentes: sin canario, sin telemetría y sin espera entre releases, porque el sitio no se está usando.
  5. Ningún release se despliega sin OK humano; R3 requiere OK explícito.

## GATE 2 — implementación R1

GATE 2 · 2026-11-10 · Jorge Diaz · APROBADO · token: "acepto" · alcance: R1 (T-1..T-10, T-9b).

- Fecha: 2026-11-10
- Quién: humano (dueño del proyecto)
- Veredicto: APROBADO
- Token: `acepto`
- Evidencia: 06-verify.md (PASS), 06-code-review.md (aprobado; M1..M4 corregidos en T-9b, re-revisión aprobada), 06-security-review.md (sin críticos, altos ni medios), `cdk diff` de R1 mostrado al humano (2 OAC, 4 permisos acotados por `AWS:SourceArn`, URLs siguen en NONE).
- Observaciones:
  1. Los hallazgos bajos de las tres revisiones pasan al backlog.
  2. Condición del security-reviewer: no activar logs de CloudFront con headers ni loggear headers en la app.
  3. El deploy a producción requiere release a `main` y aprobación del environment Production. R2 y R3 tienen sus propios gates.

## GATE 2 — implementación R2

GATE 2 · 2026-11-11 · Jorge Diaz · DELEGADO AL MERGE · alcance: R2 (T-11..T-13).

- Fecha: 2026-11-11
- Quién: humano (dueño del proyecto)
- Veredicto: el humano indicó trabajar en autónomo, abrir el PR y esperar su merge; el merge del PR de R2 es la aprobación.
- Evidencia: 06-verify-r2.md (PASS, sha 750c54a), 06-review-r2.md (sin críticos, altos ni medios; 2 bajos), `cdk diff` de R2 (URL de imagen NONE → AWS_IAM, OAC de imagen no-override → always, se eliminan los 2 permisos con principal `*` de la imagen; server sin cambios de auth).
- Observaciones:
  1. Bajo aceptado: posible ventana de 403 en imágenes mientras CloudFront propaga el cambio de firma; se verifica tras el deploy (por dominio 200, directo a la URL 403).
  2. Bajo al backlog: T6 no fija la ausencia de `FunctionAssociations` en `_next/image*`.
  3. La evidencia RED/GREEN de T-11 está en `bg-runs/` (corridas en background por durar >180 s).

## GATE 2 — implementación R3

GATE 2 · 2026-11-12 · Jorge Diaz · DELEGADO AL MERGE · alcance: R3 (T-14..T-18b).

- Veredicto: el humano indicó trabajar en autónomo, abrir el PR y esperar su merge; el merge del PR de R3 y la aprobación del environment Production son el OK explícito que exige R3.
- Evidencia: 06-verify-r3.md (PASS, sha 4e36edf; T-18b con lint, typecheck e infra 325/325 en verde), 06-review-r3.md, `cdk diff` de R3 (URL del server NONE → AWS_IAM, OAC del server no-override → always, se eliminan los 2 permisos con principal `*` del server).
- Requisitos de R3:
  - C1: `test:content-hash` PASS en chromium, webkit y firefox sobre 03cb307.
  - C2: hecho el 2026-11-12, lectura de solo consulta tras R2: imagen en AWS_IAM con solo los 2 permisos de CloudFront acotados por `AWS:SourceArn`; server con los 2 permisos de CloudFront acotados; imagen no cacheada 200 por dominio y 403 directo a la URL.
  - C3: plan post-deploy: smoke de CI (incluye POST firmado a `/api/revalidate` → 401), URL directa del server → 403, `list-function-url-configs` → AWS_IAM en ambas; el humano hace una búsqueda y una acción admin en el navegador.
  - C4: el humano, con sesión `blockealo` activa al aprobar el deploy; pendiente de su confirmación antes de aprobar Production.
- Hallazgos de 06-review-r3.md:
  1. Alto condicional (403 cacheado por `x-amz-content-sha256` falso en GET): no se reproduce. Contra `/_next/image` (ya always desde R2), hash falso, `authorization` falso y `x-amz-date`/`x-amz-security-token` falsos → 200.
  2. Medio (firma de POST solo validada en producción): sonda POST agregada al smoke (T-18b).
  3. Medio (C2 sin registro): registrado arriba.
  4. Bajos: T4b sobre toda la plantilla y comentario corregidos en T-18b; el resto al backlog.
