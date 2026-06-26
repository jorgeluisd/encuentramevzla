# GATE 2 — Implementación (Human Gate)

Parada humana **obligatoria** tras `implementer ⇄ strict-tdd → verifier` y **antes** del merge/archiver.

## Qué se revisa (input)

- Rama implementada (código + tests).
- Reporte del **verifier** (PASS/FAIL por check).
- apply-progress con el estado Strict TDD y la tabla **TDD Cycle Evidence** (si TDD ON).

## Criterios de aprobación (específicos del proyecto)

1. **Verde de stack.** `pnpm typecheck` (4/4), `pnpm test` (Vitest) y `pnpm build` en PASS.
2. **Evidencia TDD válida.** Si la tarea era TDD ON, la tabla muestra **RED(FAIL) antes que GREEN(PASS)**
   de la misma tarea, con líneas de salida pegadas y commits. Si no, **no se aprueba**.
3. **Privacidad intacta.** Re-verifica los checks de privacidad del verifier:
   `sensible` no expuesto · público solo vía RPC · menores/fallecidos sin datos · `busqueda_log` solo
   hash · sin grants nuevos al anónimo · RPC con `SECURITY DEFINER` + `search_path` fijo.
4. **Arquitectura.** Regla de dependencia respetada; `@evzla/core` puro; naming correcto.
5. **No se rompió lo verde.** Tests previos siguen pasando.
6. **Alcance.** El cambio corresponde a la tarea aprobada en Gate 1 (sin scope creep).
7. **Higiene.** `pnpm` (no `npm`); migraciones incrementales e idempotentes; cambios atómicos.

## Decisión

- ✅ **Aprobado** → pasa al `archiver` (merge + memoria + specs al día).
- 🔁 **Cambios** → vuelve al `implementer` con los FAIL del verifier.
- ⛔ **Rechazado** → no se mergea.

## Registro

La decisión (aprobado/cambios/rechazado + quién) queda en el apply-progress. El archiver guarda en
Engram las decisiones, bugs y aprendizajes del ciclo.
