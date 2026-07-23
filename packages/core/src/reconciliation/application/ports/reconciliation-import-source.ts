import type { ParsedPatientRow } from "../../../patient-registry/application/ports/patient-list-parser";

// Puerto: lee del esquema `reconciliation` las filas IMPORTABLES (categoría ONLY_IN_SOURCE,
// excluyendo el lado duplicado de DUP_IN_SOURCE) ya mapeadas a ParsedPatientRow, con la
// señal de menor propagada (ADR-0009). Lo implementa un adapter Postgres.
export interface ReconciliationImportSource {
  loadImportable(runId: string): Promise<ParsedPatientRow[]>;
}
