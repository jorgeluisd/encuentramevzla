import { describe, expect, it } from "vitest";
import { formatLastUpdate } from "./last-update";

describe("formatLastUpdate", () => {
  it("sin fecha devuelve solo 'Listas verificadas'", () => {
    expect(formatLastUpdate(null)).toBe("Listas verificadas");
  });

  it("ante una fecha inválida no revienta: cae al texto base", () => {
    expect(formatLastUpdate(new Date("no-es-fecha"))).toBe("Listas verificadas");
  });

  it("antepone 'Actualizado:' cuando hay fecha", () => {
    const d = new Date("2026-06-26T18:30:00Z");
    expect(formatLastUpdate(d)).toMatch(/^Actualizado:/);
  });

  it("convierte a hora de Venezuela (UTC-4): 18:30 UTC -> 2:30 p. m.", () => {
    const d = new Date("2026-06-26T18:30:00Z");
    const out = formatLastUpdate(d);
    expect(out).toContain("2:30");
    expect(out).toContain("26"); // día del mes
  });

  it("maneja el cruce de día por la zona horaria (01:00 UTC -> día 25 en Caracas)", () => {
    const d = new Date("2026-06-26T01:00:00Z"); // 21:00 del 25 en Caracas
    expect(formatLastUpdate(d)).toContain("25");
  });
});
