import { normalizeHospitalName } from "./hospital-name";

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
