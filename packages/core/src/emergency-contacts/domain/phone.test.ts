import { describe, expect, it } from "vitest";
import { telHref } from "./phone";

describe("telHref", () => {
  it("antepone el prefijo tel: a un número simple", () => {
    expect(telHref("911")).toBe("tel:911");
  });

  it("elimina paréntesis y espacios de un número fijo", () => {
    expect(telHref("(0212) 575-1823")).toBe("tel:02125751823");
  });

  it("elimina guiones de un número 0800", () => {
    expect(telHref("0800-725-3661")).toBe("tel:08007253661");
  });

  it("conserva el asterisco de los códigos cortos GSM", () => {
    expect(telHref("*1")).toBe("tel:*1");
  });

  it("conserva el + inicial de un número internacional", () => {
    expect(telHref("+582125714380")).toBe("tel:+582125714380");
  });

  it("normaliza un número con prefijo 0-800 y guiones", () => {
    expect(telHref("0-800-836-2567")).toBe("tel:08008362567");
  });

  it("recorta espacios alrededor", () => {
    expect(telHref("  171  ")).toBe("tel:171");
  });
});
