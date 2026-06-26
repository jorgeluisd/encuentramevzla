# GATE 1 — Diseño (Human Gate)

Parada humana **obligatoria** tras `spec-writer → designer → task-planner` y **antes** de tocar código.
Nada se implementa sin pasar este gate.

## Qué se revisa (input)

- Spec `specs/NNNN-*.md` con criterios de aceptación.
- Diseño técnico (capas onion, ports/adapters, impacto en schema/RPC).
- Lista de tareas con **Strict TDD ON/OFF** por tarea.

## Criterios de aprobación (específicos del proyecto)

1. **Spec claro.** Criterios de aceptación concretos y convertibles a tests de Vitest.
2. **Arquitectura sana.** El diseño respeta Onion + Screaming; el dominio queda puro; reutiliza lo existente.
3. **Privacidad revisada (innegociable).** Si el cambio toca datos/`sensible`/RPC/menores/fallecidos:
   - ¿Se preserva la búsqueda mediada (`buscar_paciente`)?
   - ¿Sigue aislado el schema `sensible`?
   - ¿Menores/fallecidos quedan fuera del buscador?
   - ¿`busqueda_log` solo hash? ¿Sin grants nuevos al anónimo?
   - Cambios al contrato del buscador (p. ej. mostrar nombres) requieren **decisión humana explícita**
     (consultar a la residente) + plan de migración.
4. **TDD marcado.** Cada tarea tiene ON/OFF justificado; no quedan tareas `TDD: ?` sin resolver.
5. **No romper lo verde.** El plan es de estrangulamiento; identifica los tests existentes a respetar.
6. **Stack fijo.** No se introducen tecnologías fuera del stack sin justificación en el spec.

## Decisión

- ✅ **Aprobado** → pasa al `implementer`.
- 🔁 **Cambios** → vuelve al spec-writer/designer/task-planner con feedback.
- ⛔ **Rechazado** → no se implementa.

## Registro

La decisión del gate (aprobado/cambios/rechazado + quién) se registra junto al plan de tareas.
Si hubo una decisión de privacidad/diseño relevante, el archiver la guardará como ADR + memoria Engram.
