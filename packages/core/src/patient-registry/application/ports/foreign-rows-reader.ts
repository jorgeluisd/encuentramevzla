import type { ParsedPatientRow } from "./patient-list-parser";

// Fila segregada en una carga scoped por nombrar un hospital ajeno (ADR-0006).
export interface ForeignRow {
  fingerprint: string;
  hospitalName: string; // el hospital ajeno que nombraba la fila
  fullName: string | null; // preview (el nombre ya es público en el buscador)
}

export interface ForeignRowsReader {
  // Filas segregadas aún sin resolver: `ingest_foreign_hospital_row` sin `foreign_row_resolved`.
  listOpen(): Promise<ForeignRow[]>;
  // Reconstruye la fila parseada desde raw_rows para reingesta. `hospitalName` va en null:
  // el destino se fuerza en la reasignación. null si no existe la cruda.
  loadParsedRow(fingerprint: string): Promise<ParsedPatientRow | null>;
}
