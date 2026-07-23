// Puerto de entrada: parsea el .xlsx consolidado. Lo implementa un adapter (SheetJS) en
// infraestructura; el dominio/aplicación no conocen a `xlsx`.

// Columnas comunes esperadas en las 21 pestañas (la fila 4 del Excel).
export const EXPECTED_COLUMNS = [
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
] as const;

// Fila cruda ya validada y con los campos comunes extraídos como texto. `raw` preserva
// TODAS las columnas (incluidas las 14 sensibles de "Refugio Oeste") para el staging.
export interface ConsolidatedRawRow {
  sheetName: string;
  sourceRowNumber: number; // fila en el Excel (1-based)
  raw: Record<string, string>;
  surname: string;
  givenName: string;
  cedula: string;
  age: string;
  sex: string;
  origin: string;
  currentCenter: string;
  notes: string;
  registeredDateRaw: string;
  registeredTimeRaw: string;
}

export interface ConsolidatedSheet {
  sheetName: string;
  rows: ConsolidatedRawRow[];
}

export interface ConsolidatedSource {
  sheets: ConsolidatedSheet[];
}

export interface ConsolidatedSourceReader {
  read(bytes: Uint8Array): ConsolidatedSource;
}

// Falla ruidosa: una pestaña no expone las columnas comunes esperadas. Nada de degradar en silencio.
export class MissingColumnsError extends Error {
  constructor(
    readonly sheetName: string,
    readonly missing: readonly string[],
  ) {
    super(
      `La pestaña "${sheetName}" no expone las columnas esperadas: ${missing.join(", ")}. ` +
        `El parser aborta en vez de degradar en silencio.`,
    );
    this.name = "MissingColumnsError";
  }
}
