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
  // Señal explícita de menor de edad (ADR-0009): la reconciliación la propaga desde el
  // staging (centinelas de cédula INFANTE/[Menor] que NO están en el nombre). Si es true,
  // fuerza is_minor aunque la edad/nombre no lo indiquen → nunca expone el nombre de un menor.
  isMinor?: boolean;
}

export interface ParsedPatientList {
  sheet: string;
  rows: ParsedPatientRow[];
}

// Parser del Excel: lo implementa el adapter SheetJS (infraestructura).
export interface PatientListParser {
  parse(bytes: Uint8Array): ParsedPatientList;
}
