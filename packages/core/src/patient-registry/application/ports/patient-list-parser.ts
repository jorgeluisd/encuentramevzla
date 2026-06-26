export interface ParsedPatientRow {
  fingerprint: string; // hash del crudo (idempotencia)
  raw: Record<string, unknown>; // fila cruda preservada para staging/trazabilidad
  hospitalName: string | null;
  fullName: string | null;
  age: number | null;
  documentNumber: string | null;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
}

export interface ParsedPatientList {
  sheet: string;
  rows: ParsedPatientRow[];
}

// Parser del Excel: lo implementa el adapter SheetJS (infraestructura).
export interface PatientListParser {
  parse(bytes: Uint8Array): ParsedPatientList;
}
