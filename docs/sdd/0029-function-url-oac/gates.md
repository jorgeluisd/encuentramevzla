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
