import {
  type ConsolidatedRawRow,
  type ConsolidatedSheet,
  type ConsolidatedSource,
  type ConsolidatedSourceReader,
  EXPECTED_COLUMNS,
  MissingColumnsError,
} from "@evzla/core";
import * as XLSX from "xlsx";

// Adapter SheetJS del .xlsx consolidado (21 pestañas, header en la fila 4). Falla RUIDOSO
// si una pestaña no expone las columnas comunes esperadas. Preserva TODAS las columnas en
// `raw` (incluidas las 14 sensibles de "Refugio Oeste").

type Canonical = (typeof EXPECTED_COLUMNS)[number];

const MATCHERS: Record<Canonical, (h: string) => boolean> = {
  APELLIDO: (h) => h === "apellido",
  NOMBRE: (h) => h === "nombre",
  "CÉDULA": (h) => h.startsWith("cedula"),
  EDAD: (h) => h === "edad",
  SEXO: (h) => h === "sexo",
  PROCEDENCIA: (h) => h.startsWith("procedencia"),
  "CENTRO ACTUAL": (h) => h.startsWith("centro"),
  OBSERVACIONES: (h) => h === "observaciones",
  "FECHA REG.": (h) => h.startsWith("fecha reg"),
  "HORA REG.": (h) => h.startsWith("hora reg"),
};

export class SheetjsConsolidatedSourceReader implements ConsolidatedSourceReader {
  read(bytes: Uint8Array): ConsolidatedSource {
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const sheets: ConsolidatedSheet[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: true,
        defval: null,
        raw: true,
      });

      const headerIndex = matrix.findIndex((row) =>
        (row ?? []).some((c) => /apellido/i.test(String(c ?? ""))),
      );
      if (headerIndex < 0) throw new MissingColumnsError(sheetName, [...EXPECTED_COLUMNS]);

      const headers = (matrix[headerIndex] ?? []).map((c) => cellToString(c));
      const normalizedHeaders = headers.map(normalizeHeader);
      const columnIndex = resolveColumns(normalizedHeaders);

      const missing = EXPECTED_COLUMNS.filter((c) => columnIndex[c] === undefined);
      if (missing.length > 0) throw new MissingColumnsError(sheetName, missing);

      const rows: ConsolidatedRawRow[] = [];
      for (let r = headerIndex + 1; r < matrix.length; r++) {
        const cells = matrix[r] ?? [];
        const surname = at(cells, columnIndex.APELLIDO);
        const givenName = at(cells, columnIndex.NOMBRE);
        if (surname === "" && givenName === "") continue; // fila vacía

        const raw: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h !== "") raw[h] = cellToString(cells[i]);
        });

        rows.push({
          sheetName,
          sourceRowNumber: r + 1, // fila de Excel (1-based)
          raw,
          surname,
          givenName,
          cedula: at(cells, columnIndex["CÉDULA"]),
          age: at(cells, columnIndex.EDAD),
          sex: at(cells, columnIndex.SEXO),
          origin: at(cells, columnIndex.PROCEDENCIA),
          currentCenter: at(cells, columnIndex["CENTRO ACTUAL"]),
          notes: at(cells, columnIndex.OBSERVACIONES),
          registeredDateRaw: at(cells, columnIndex["FECHA REG."]),
          registeredTimeRaw: at(cells, columnIndex["HORA REG."]),
        });
      }

      sheets.push({ sheetName, rows });
    }

    return { sheets };
  }
}

function resolveColumns(normalizedHeaders: string[]): Partial<Record<Canonical, number>> {
  const map: Partial<Record<Canonical, number>> = {};
  for (const canonical of EXPECTED_COLUMNS) {
    const index = normalizedHeaders.findIndex((h) => MATCHERS[canonical](h));
    if (index >= 0) map[canonical] = index;
  }
  return map;
}

function at(cells: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  return cellToString(cells[index]);
}

// Excel date (cellDates) → ISO YYYY-MM-DD sin corrimiento de zona; el resto → texto.
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(value).trim();
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
