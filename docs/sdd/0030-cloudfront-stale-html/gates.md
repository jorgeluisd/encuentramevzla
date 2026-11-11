# 0030 cloudfront-stale-html: gates

## GATE 1 — diseño

GATE 1 · 2026-11-11 · Jorge Diaz · APROBADO · token: "acepto" · alcance: T-1..T-7.

- Fecha: 2026-11-11
- Quién: humano (dueño del proyecto)
- Veredicto: APROBADO
- Token: `acepto`
- Alcance aprobado: 02-spec.md, 03-design.md, 04-plan.md (incluye el ajuste del comentario del home en T-2) y ADR-0013 en estado PROPUESTO (no ratificado).
- Observaciones:
  1. Enfoque A1 + B1 elegido por el humano: invalidación `/*` dentro del stack tras el update de la server function, y `maxTtl` 300 s en `ServerCachePolicy`.
  2. El rol de CI no cambia.
  3. Precondición de 0029 R3: un deploy a producción con esta feature, smoke de build id en verde y M-1..M-3 confirmados.
  4. Ningún deploy a producción sin OK humano.

## GATE 2 — implementación

GATE 2 · 2026-11-11 · Jorge Diaz · APROBADO · token: "acepto" · alcance: T-1..T-8b.

- Fecha: 2026-11-11
- Quién: humano (dueño del proyecto)
- Veredicto: APROBADO
- Token: `acepto`
- Evidencia: 06-verify.md (PASS, sha d64c80c; T-8/T-8b con lint, typecheck e infra 318/318 en verde), 06-code-review.md (alto y medios corregidos en T-8 y T-8b, re-revisión aprobada), 06-security-review.md (sin críticos, altos ni medios), `cdk diff` mostrado al humano (HtmlInvalidation con `cloudfront:CreateInvalidation` sobre la distribución, handler singleton con su rol y log group, ServerCachePolicy MaxTTL 31536000 → 300; Email y Certificate sin diferencias).
- Observaciones:
  1. Los hallazgos bajos de las revisiones pasan al backlog.
  2. Los recursos nuevos taggeables (log group, rol y Lambda del handler) llevan `project=encuentramevzla`; el custom resource y la policy no admiten tags ni tienen costo.
  3. El deploy a producción requiere release a `main` y aprobación del environment Production. Después: verificación M-1..M-4, precondición de 0029 R3.
