import { cedulaMatchKey, normalizeCedulaCell } from "./cedula-cell";

describe("normalizeCedulaCell", () => {
  it("keeps a valid cédula (≥ 6 digits) in prod-compatible form", () => {
    expect(normalizeCedulaCell("24.140.952")).toEqual({
      normalized: "24140952",
      isDocValid: true,
      isMinorSentinel: false,
      wasSentinel: false,
    });
    expect(normalizeCedulaCell("V-10235290").normalized).toBe("V10235290");
  });

  it("maps textual sentinels to null and flags them as sentinels", () => {
    for (const s of ["-", "SIN CI", "SIN C.I", "NPD", "no tiene", "NO POSEE", "S/D", "SIN CEDULA"]) {
      const cell = normalizeCedulaCell(s);
      expect(cell.normalized).toBeNull();
      expect(cell.isDocValid).toBe(false);
      expect(cell.wasSentinel).toBe(true);
    }
  });

  it("derives is_minor from minor-indicating sentinels without losing the signal", () => {
    expect(normalizeCedulaCell("INFANTE").isMinorSentinel).toBe(true);
    expect(normalizeCedulaCell("[Menor]").isMinorSentinel).toBe(true);
    expect(normalizeCedulaCell("MENOR").isMinorSentinel).toBe(true);
    expect(normalizeCedulaCell("[Menor]").normalized).toBeNull();
    expect(normalizeCedulaCell("SIN CI").isMinorSentinel).toBe(false);
  });

  it("treats empty as neither valid nor sentinel", () => {
    expect(normalizeCedulaCell("")).toEqual({
      normalized: null,
      isDocValid: false,
      isMinorSentinel: false,
      wasSentinel: false,
    });
    expect(normalizeCedulaCell("   ").wasSentinel).toBe(false);
  });

  it("builds a match key that strips leading zeros and rejects short numbers", () => {
    expect(cedulaMatchKey("0024140952")).toBe("24140952");
    expect(cedulaMatchKey("V24140952")).toBe("24140952");
    expect(cedulaMatchKey("24140952")).toBe("24140952");
    expect(cedulaMatchKey("123")).toBeNull();
    expect(cedulaMatchKey(null)).toBeNull();
  });
});
