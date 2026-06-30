import { describe, expect, it } from "vitest";
import type { ExportRow } from "@evzla/core";
import { mapColumns, mapRow, parsePatientSheet } from "./excel-parsing";
import { EXPORT_HEADER, SheetjsWorkbookWriter } from "./sheetjs-workbook-writer";

const exportRow = (over: Partial<ExportRow>): ExportRow => ({
  hospitalName: "Hospital X",
  fullName: "Perez Juan",
  age: 40,
  documentNumber: "24.140.952",
  status: "admitted",
  isMinor: false,
  phone: "0412-1112233",
  address: "Caracas",
  clinicalNotes: "dolor toracico",
  ...over,
});

describe("SheetjsWorkbookWriter", () => {
  it("escribe un .xlsx cuyo encabezado lo reconoce el parser de ingesta (round-trip)", () => {
    const bytes = new SheetjsWorkbookWriter().write([exportRow({})]);
    const { headers } = parsePatientSheet(bytes);
    // El header del export es EXACTAMENTE el de la ingesta (sin columnas de control).
    expect(headers).toEqual(EXPORT_HEADER);
    const map = mapColumns(headers);
    expect(map.fullName).toBe("APELLIDOS Y NOMBRES");
    expect(map.documentNumber).toBe("CÉDULA / ID");
  });

  it("round-trip: lo escrito se vuelve a parsear a los mismos campos canónicos", () => {
    const rows: ExportRow[] = [
      exportRow({ fullName: "Perez Juan", documentNumber: "24.140.952", age: 40 }),
      exportRow({ fullName: "Lopez Ana", documentNumber: null, age: null, phone: null, address: null, clinicalNotes: null }),
    ];
    const bytes = new SheetjsWorkbookWriter().write(rows);

    const { headers, rows: parsedRaw } = parsePatientSheet(bytes);
    const map = mapColumns(headers);
    expect(parsedRaw).toHaveLength(2);

    const a = mapRow(parsedRaw[0]!, map);
    expect(a.fullName).toBe("Perez Juan");
    expect(a.documentNumber).toBe("24.140.952");
    expect(a.age).toBe(40);
    expect(a.hospitalName).toBe("Hospital X");
    expect(a.phone).toBe("0412-1112233");
    expect(a.address).toBe("Caracas");
    expect(a.clinicalNotes).toBe("dolor toracico");

    const b = mapRow(parsedRaw[1]!, map);
    expect(b.fullName).toBe("Lopez Ana");
    expect(b.documentNumber).toBeNull();
    expect(b.age).toBeNull();
    expect(b.phone).toBeNull();
  });
});
