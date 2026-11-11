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
