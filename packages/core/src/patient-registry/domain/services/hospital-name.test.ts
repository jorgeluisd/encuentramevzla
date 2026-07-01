import { matchHospital, normalizeHospitalName } from "./hospital-name";

describe("normalizeHospitalName", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalizeHospitalName("Hospital Pérez Carreño")).toBe("perez carreno");
  });

  it("drops generic institution prefixes (hospital/hosp/h/clinica/centro)", () => {
    expect(normalizeHospitalName("H. Vargas")).toBe("vargas");
    expect(normalizeHospitalName("Hospital Vargas de Caracas")).toBe("vargas de caracas");
    expect(normalizeHospitalName("Clínica Santa María")).toBe("santa maria");
  });

  it("is stable across case and spacing variants", () => {
    expect(normalizeHospitalName("CAMPO DE GOLF CARIBE")).toBe(
      normalizeHospitalName("Campo de Golf Caribe"),
    );
  });

  it("returns empty for blank or only-generic input", () => {
    expect(normalizeHospitalName("   ")).toBe("");
    expect(normalizeHospitalName("Hospital")).toBe("");
  });
});

describe("matchHospital", () => {
  const catalog = [
    { id: "h1", normalized: normalizeHospitalName("Hospital Vargas de Caracas") },
    { id: "h2", normalized: normalizeHospitalName("Hospital Pérez Carreño") },
  ];

  it("matches an exact normalized name", () => {
    expect(matchHospital(normalizeHospitalName("H. Vargas de Caracas"), catalog)).toBe("h1");
  });

  it("matches a close variant (typo) above the threshold", () => {
    expect(matchHospital(normalizeHospitalName("Vargas de Caracaz"), catalog)).toBe("h1");
  });

  it("returns null for a disjoint name (a genuinely new hospital)", () => {
    expect(matchHospital(normalizeHospitalName("CAMPO DE GOLF CARIBE"), catalog)).toBeNull();
  });

  it("returns null for empty input or empty catalog", () => {
    expect(matchHospital("", catalog)).toBeNull();
    expect(matchHospital(normalizeHospitalName("Hospital Vargas"), [])).toBeNull();
  });
});
