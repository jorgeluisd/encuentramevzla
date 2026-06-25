import { describe, expect, it } from "vitest";
import {
  normalizarDocumento,
  normalizarNombre,
  tokenSet,
  tokenize,
  unaccent,
} from "../src/normalize";

describe("normalize", () => {
  it("unaccent quita diacríticos", () => {
    expect(unaccent("Pérez Núñez")).toBe("Perez Nunez");
  });

  it("normalizarNombre baja a minúsculas, sin acentos ni puntuación", () => {
    expect(normalizarNombre("  José  Pérez-Núñez!! ")).toBe("jose perez nunez");
  });

  it("tokenize devuelve palabras", () => {
    expect(tokenize("Juan Carlos Pérez")).toEqual(["juan", "carlos", "perez"]);
  });

  it("tokenSet es invariante al orden de las palabras", () => {
    expect(tokenSet("Juan Pérez")).toEqual(tokenSet("Pérez Juan"));
  });

  it("normalizarDocumento deja solo alfanumérico en mayúsculas", () => {
    expect(normalizarDocumento("v-12.345.678")).toBe("V12345678");
  });
});
