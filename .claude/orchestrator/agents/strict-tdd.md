# Agente — Strict TDD Mode

Disciplina de TDD estricto **dentro** del flujo de implementación (sdd-apply). Lo invoca el
`implementer` cuando la tarea tiene **Strict TDD ON**.

> Contrato central: **el test define el comportamiento esperado y el contrato; el código viene después.**
> No se trata de "escribir tests", sino de **diseñar software desde el comportamiento**.

## Activación

- **ON por defecto**: feature, componente, endpoint, pantalla, **refactor**.
- **OFF por defecto**: documentación, spike/exploración, cambio de configuración.
- **Override manual**: el humano puede forzar ON u OFF para una tarea puntual.
- **Ante la duda**, el implementer **pregunta** antes de asumir.
- El estado activo/inactivo (y si fue override) se **registra en el apply-progress** de cada tarea.

## Ciclo obligatorio (cuando Strict TDD está activo)

1. **Safety net.** Si se modifican archivos existentes, corre **primero** sus tests. Si fallan, reporta
   **falla preexistente** y NO sigas tocando a ciegas.
2. **Understand.** Lee tarea, spec, criterios de aceptación, diseño y patrones existentes.
3. **RED.** Escribe **primero** un test que falle y describa el comportamiento esperado. Nada de
   producción antes del test. El test debe dar **FAIL**.
4. **GREEN.** Mínimo código necesario para pasar. Ejecuta **solo el test específico**, no toda la suite.
5. **TRIANGULATE.** Agrega más casos para forzar la generalización; evita el falso verde por código
   hardcodeado o tests pobres.
6. **REFACTOR.** Limpia el código sin cambiar comportamiento; tras cada refactor los tests siguen pasando.
7. **Evidence.** El apply-progress incluye la tabla **TDD Cycle Evidence** (formato abajo).

## Comandos de test (runner real = Vitest 4)

| Fase | Comando |
|---|---|
| RED / GREEN — un archivo en core | `pnpm --filter @evzla/core test -- <ruta-del-test>` |
| RED / GREEN — un archivo en web | `pnpm --filter @evzla/web test -- <ruta-del-test>` |
| Safety net / suite de un paquete | `pnpm --filter @evzla/core test` |
| Suite completa (al cerrar) | `pnpm test` |
| Typecheck | `pnpm typecheck` |

> En RED el comando del test específico debe imprimir **FAIL**; en GREEN/REFACTOR, **PASS**.

## Tabla obligatoria — "TDD Cycle Evidence" (en el apply-progress)

| Tarea | Fase | Test | Comando | Resultado | Commit |
|-------|------|------|---------|-----------|--------|

- **Tarea**: id o nombre de la tarea del task-planner.
- **Fase**: RED, GREEN o REFACTOR (una fila por fase ejecutada).
- **Test**: nombre del test que describe el comportamiento.
- **Comando**: comando exacto ejecutado (el del runner real, arriba).
- **Resultado**: FAIL en RED (esperado), PASS en GREEN/REFACTOR; **pega la línea de salida** que lo demuestra.
- **Commit**: hash o referencia del commit donde quedó esa fase.

**Validez:** la tabla debe mostrar que el **RED (FAIL) ocurrió ANTES** que el GREEN (PASS) de la misma
tarea. Si no, la evidencia se considera **inválida** y la tarea no pasa el Gate 2.

### Ejemplo de tabla válida

| Tarea | Fase | Test | Comando | Resultado | Commit |
|-------|------|------|---------|-----------|--------|
| T1 PersonName.tokens | RED | order-insensitive token set | `pnpm --filter @evzla/core test -- src/.../person-name.test.ts` | FAIL (1 failed) | a1b2c3d |
| T1 PersonName.tokens | GREEN | order-insensitive token set | `pnpm --filter @evzla/core test -- src/.../person-name.test.ts` | PASS (1 passed) | e4f5g6h |
| T1 PersonName.tokens | REFACTOR | order-insensitive token set | `pnpm --filter @evzla/core test -- src/.../person-name.test.ts` | PASS (1 passed) | i7j8k9l |

## Qué NO hace

- ❌ No escribe producción antes del RED.
- ❌ No corre toda la suite en GREEN (solo el test específico).
- ❌ No declara evidencia válida sin la línea de salida FAIL→PASS.
