import { MissingColumnsError } from "@evzla/core";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { SheetjsConsolidatedSourceReader } from "./sheetjs-consolidated-source-reader";

const HEADER = [
  "APELLIDO",
  "NOMBRE",
  "CÉDULA",
  "EDAD",
  "SEXO",
  "PROCEDENCIA",
  "CENTRO ACTUAL",
  "OBSERVACIONES",
  "FECHA REG.",
  "HORA REG.",
];

function workbook(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

const INFO_ROWS = [["REGISTRO MAESTRO"], ["subtítulo"], ["nota"]];

describe("SheetjsConsolidatedSourceReader", () => {
  it("parses the header on row 4, extracts common fields and preserves all raw columns", () => {
    const bytes = workbook({
      "Test Center": [
        ...INFO_ROWS,
        [...HEADER, "TELÉFONO"], // columna extra (estilo Refugio Oeste)
        ["PEÑA", "JOSÉ", "24.140.952", "35", "M", "Caracas", "Test Center", "obs", "25/06/2026", "10:00", "0412-1"],
        [null, null, null, null, null, null, null, null, null, null, null], // vacía → se salta
      ],
    });

    const source = new SheetjsConsolidatedSourceReader().read(bytes);
    expect(source.sheets).toHaveLength(1);
    const sheet = source.sheets[0]!;
    expect(sheet.rows).toHaveLength(1);

    const row = sheet.rows[0]!;
    expect(row.surname).toBe("PEÑA");
    expect(row.givenName).toBe("JOSÉ");
    expect(row.cedula).toBe("24.140.952");
    expect(row.age).toBe("35");
    expect(row.sex).toBe("M");
    expect(row.registeredDateRaw).toBe("25/06/2026");
    expect(row.sourceRowNumber).toBe(5); // 3 info + header + 1ª fila de datos
    // El crudo preserva TODAS las columnas, incluida la extra sensible.
    expect(row.raw["TELÉFONO"]).toBe("0412-1");
    expect(row.raw["APELLIDO"]).toBe("PEÑA");
  });

  it("fails loud when a sheet lacks an expected column", () => {
    const badHeader = HEADER.filter((h) => h !== "SEXO");
    const bytes = workbook({
      "Refugio Oeste": [...INFO_ROWS, badHeader, ["PEREZ", "ANA", "-", "40", "Caracas", "x", "o", "1/1/2026", "9:00"]],
    });
    const reader = new SheetjsConsolidatedSourceReader();
    expect(() => reader.read(bytes)).toThrow(MissingColumnsError);
    expect(() => reader.read(bytes)).toThrow(/no expone las columnas/);
  });
});
