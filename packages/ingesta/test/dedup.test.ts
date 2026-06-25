import { describe, expect, it } from "vitest";
import {
  levenshtein,
  scoreDedup,
  tokenSetSimilarity,
  trigramSimilarity,
} from "../src/dedup";

describe("dedup", () => {
  it("levenshtein cuenta ediciones", () => {
    expect(levenshtein("juan", "juan")).toBe(0);
    expect(levenshtein("juan", "juana")).toBe(1);
    expect(levenshtein("perez", "peres")).toBe(1);
  });

  it("trigramSimilarity: idénticos = 1, distintos < 1", () => {
    expect(trigramSimilarity("hospital", "hospital")).toBe(1);
    expect(trigramSimilarity("hospital", "xyz")).toBeLessThan(0.2);
  });

  it("tokenSetSimilarity ignora el orden de palabras", () => {
    expect(tokenSetSimilarity("juan perez", "perez juan")).toBe(1);
  });

  it("scoreDedup está acotado en [0,1] y premia coincidencias", () => {
    const alto = scoreDedup("Juan Pérez", "Juan Perez");
    const bajo = scoreDedup("Juan Pérez", "Maria Gomez");
    expect(alto).toBeGreaterThan(bajo);
    expect(alto).toBeLessThanOrEqual(1);
    expect(bajo).toBeGreaterThanOrEqual(0);
  });
});
