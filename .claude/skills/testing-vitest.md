# Skill — Testing con Vitest 4 (+ TDD)

Runner real del proyecto: **Vitest 4**. Tests **colocados** junto al código (`archivo.ts` + `archivo.test.ts`).
Histórico: 36 tests · typecheck 4/4 · build OK. TDD es obligatorio en features (ver enganche abajo).

## Comandos

| Objetivo | Comando |
|---|---|
| Suite completa (turbo) | `pnpm test` |
| Un paquete | `pnpm --filter @evzla/core test` · `pnpm --filter @evzla/web test` |
| Un archivo de test | `pnpm --filter @evzla/core test -- <ruta-del-test>` |
| Typecheck | `pnpm typecheck` (objetivo 4/4) |

> Cada `package.json` define `"test": "vitest run"`. `@evzla/core` también tiene `test:watch`.

## Estilo de tests

- Globals de Vitest activos: se usan `describe` / `it` / `expect` **sin importar** (no `import { describe }`).
- Nombres de test en **inglés**, descriptivos del comportamiento ("normalizes accents, case and punctuation").
- Tests de **dominio** (`@evzla/core`): puros, sin I/O, rápidos. Verifican value objects, servicios,
  casos de uso (con **fakes** que implementan los ports, no mocks de librerías).
- Tests de **infraestructura** (`apps/web`): verifican adapters (p. ej. `excel-parsing.test.ts`).
- Un test = un comportamiento. Cubre los criterios de aceptación del spec (`specs/000X`).

Ejemplo (de `person-name.test.ts`):
```ts
import { PersonName } from "./person-name";

describe("PersonName", () => {
  it("produces an order-insensitive token set", () => {
    expect(PersonName.fromRaw("Juan Pérez").tokens).toEqual(["juan", "perez"]);
  });
});
```

## Enganche con Strict TDD

Para feature/componente/endpoint/pantalla/refactor, el flujo de implementación corre **Strict TDD**
(ver `orchestrator/agents/strict-tdd.md`):

1. **Safety net** — si tocas archivos existentes, corre primero sus tests; si fallan, reporta falla
   preexistente y NO sigas a ciegas.
2. **RED** — escribe primero un test que falle y describa el comportamiento. Comando específico:
   `pnpm --filter @evzla/core test -- <ruta-test>` → debe dar **FAIL**.
3. **GREEN** — mínimo código para pasar **ese** test (no toda la suite).
4. **TRIANGULATE** — más casos para forzar generalización (evita el falso verde / hardcode).
5. **REFACTOR** — limpia sin cambiar comportamiento; los tests siguen verdes.

La evidencia va en el apply-progress como tabla **TDD Cycle Evidence** (RED FAIL antes que GREEN PASS).

## Checklist

- [ ] ¿Test colocado (`*.test.ts`) junto al código?
- [ ] ¿El test describe un comportamiento de los criterios del spec?
- [ ] ¿Dominio probado con fakes de los ports (sin I/O)?
- [ ] ¿`pnpm test` y `pnpm typecheck` verdes antes de cerrar?
- [ ] Si es feature, ¿hay evidencia TDD (RED→GREEN)?
