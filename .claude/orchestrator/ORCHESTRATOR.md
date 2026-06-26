# ORCHESTRATOR — Pipeline SDD de EncuéntrameVzla

Director del flujo Spec-Driven Development para una **web full-stack sobre Supabase**. Coordina los
agentes de `agents/` y exige el paso por dos **Human Gates**. Nada de código antes del Gate 1.

## Pipeline

```
explorer → proposer → spec-writer → designer → task-planner
   → ⟦GATE 1: diseño⟧
   → implementer ⇄ strict-tdd
   → verifier
   → ⟦GATE 2: implementación⟧
   → archiver
```

- `⇄` significa que el **implementer invoca a strict-tdd** por cada tarea con Strict TDD ON.
- Los gates son **paradas humanas obligatorias** (ver `gates/`). Sin aprobación no se avanza.

## Agentes (resumen de contratos)

| # | Agente | Input | Output |
|---|---|---|---|
| 1 | explorer | objetivo/tarea + acceso al repo | mapa de archivos, capas afectadas, hallazgos |
| 2 | proposer | hallazgos del explorer | 2–3 enfoques con trade-offs + recomendación |
| 3 | spec-writer | enfoque aprobado | `specs/NNNN-*.md` (contexto, criterios de aceptación) |
| 4 | designer | spec | diseño técnico (capas onion, ports, impacto schema/RPC, privacidad) |
| 5 | task-planner | diseño | tareas atómicas; cada una con **Strict TDD ON/OFF** |
| — | **GATE 1** | spec + diseño + plan | aprobación humana de diseño y privacidad |
| 6 | implementer | tarea | código + apply-progress; invoca strict-tdd si TDD ON |
| 7 | strict-tdd | tarea con TDD ON | ciclo RED→…→REFACTOR + tabla *TDD Cycle Evidence* |
| 8 | verifier | rama implementada | checks de stack PASS/FAIL |
| — | **GATE 2** | impl + verificación | aprobación humana para merge |
| 9 | archiver | trabajo verificado | resumen + `mem_save` Engram + specs/README al día |

Cada agente documenta su contrato completo en `agents/<nombre>.md`.

## Reglas del pipeline

1. **SDD primero.** Ninguna feature se implementa sin spec en `specs/`.
2. **Privacidad transversal.** En cada fase se pregunta: ¿toca datos/`sensitive`/RPC/menores? Si sí,
   `skills/privacy-and-security.md` es de lectura obligatoria y entra en los criterios de los gates.
3. **No romper lo verde.** El implementer corre el safety net antes de tocar archivos existentes.
4. **TDD marcado por tarea.** El task-planner fija ON/OFF y el implementer lo registra en apply-progress.
5. **pnpm siempre.** Nunca `npm`.
6. **Memoria.** El archiver guarda decisiones/bugs/hallazgos en Engram (tags: `encuentramevzla`,
   `privacidad`, `dedup`, `supabase`, `arquitectura`).

## Cuándo usar el pipeline completo vs. atajos

- **Feature nueva / cambio en buscador / migración SQL / schema** → pipeline completo (con ambos gates).
- **Bugfix pequeño con test** → explorer → implementer ⇄ strict-tdd → verifier → Gate 2.
- **Doc / spike / config** → sin Strict TDD; igual pasa por verifier (typecheck/build) si toca código.
