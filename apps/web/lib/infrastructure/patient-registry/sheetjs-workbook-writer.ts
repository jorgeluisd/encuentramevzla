import * as XLSX from "xlsx";
import type { ExportRow } from "@evzla/core";

// Encabezado canónico del export = el MISMO que reconoce la ingesta (excel-parsing PATTERNS),
// sin columnas de control. Garantiza round-trip limpio: descargar → editar → re-subir. (D6)
export const EXPORT_HEADER = [
  "HOSPITAL",
  "APELLIDOS Y NOMBRES",
  "EDAD",
  "CÉDULA / ID",
  "TELÉFONO",
  "DIRECCIÓN",
  "OBSERVACIONES",
] as const;

const SHEET_NAME = "Pacientes";

// Adapter SheetJS inverso del parser: ExportRow[] → bytes .xlsx. Detalle de infraestructura.
export class SheetjsWorkbookWriter {
  write(rows: readonly ExportRow[]): Uint8Array {
    // El estado/menor NO van como columna: son control y se preservan en la DB (fuente de verdad).
    const body = rows.map((r) => [
      r.hospitalName,
      r.fullName ?? "",
      r.age ?? "",
      r.documentNumber ?? "",
      r.phone ?? "",
      r.address ?? "",
      r.clinicalNotes ?? "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[...EXPORT_HEADER], ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  }
}
