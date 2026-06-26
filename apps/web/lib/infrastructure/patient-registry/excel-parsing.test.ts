import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapColumns, mapRow, parsePatientSheet } from "./excel-parsing";

// Hoja sintética con 2 filas banner antes del encabezado real (como el Excel real).
function buildWorkbook(): Uint8Array {
  const aoa = [
    ["REGISTRO MAESTRO DE PACIENTES", null, null, null, null, null],
    ["use Ctrl+F para buscar", null, null, null, null, null],
    ["N°", "HOSPITAL", "APELLIDOS Y NOMBRES", "EDAD", "CÉDULA / ID", "TELÉFONO"],
    ["1", "Hospital X", "Perez Juan", "40", "24.140.952", "0412-1112233"],
    ["2", "Hospital Y", "Lopez Ana", "30", null, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("parsePatientSheet", () => {
  it("skips banner rows and finds the real header", () => {
    const { sheet, headers, rows } = parsePatientSheet(buildWorkbook());
    expect(sheet).toBe("Pacientes");
    expect(headers).toContain("APELLIDOS Y NOMBRES");
    expect(rows).toHaveLength(2);
  });
});

describe("mapColumns", () => {
  it("maps document to CÉDULA, not to APELLIDOS (no 'id' false positive)", () => {
    const { headers } = parsePatientSheet(buildWorkbook());
    const map = mapColumns(headers);
    expect(map.documentNumber).toBe("CÉDULA / ID");
    expect(map.fullName).toBe("APELLIDOS Y NOMBRES");
  });
});

describe("mapRow", () => {
  it("maps canonical fields", () => {
    const { headers, rows } = parsePatientSheet(buildWorkbook());
    const mapped = mapRow(rows[0]!, mapColumns(headers));
    expect(mapped.fullName).toBe("Perez Juan");
    expect(mapped.documentNumber).toBe("24.140.952");
    expect(mapped.age).toBe(40);
    expect(mapped.hospitalName).toBe("Hospital X");
  });
});
