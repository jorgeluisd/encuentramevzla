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
  // Toggle explícito "¿falleció?" (voz/manual, D8). El Excel no lo trae → undefined.
  // Si es true fuerza el estado fallecido aunque la nota no contenga el marcador.
  deceased?: boolean;
}

export interface ParsedPatientList {
  sheet: string;
  rows: ParsedPatientRow[];
}

// Parser del Excel: lo implementa el adapter SheetJS (infraestructura).
export interface PatientListParser {
  parse(bytes: Uint8Array): ParsedPatientList;
}
