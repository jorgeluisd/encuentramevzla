import type { IngestionSummary } from "./ingest-patient-list";

// Estado de presentación de una carga para la tabla "Cargas recientes" del portal.
// "review" si hay conflictos de cédula o filas de zona gris (decide la residente);
// si no, "published". El estado "invalid" (formato inválido) lo decide la UI ante un
// error de procesamiento, no este helper.
export type IngestionDisplayStatus = "published" | "review";

export function ingestionDisplayStatus(
  summary: IngestionSummary,
): IngestionDisplayStatus {
  const needsReview = summary.documentConflicts + summary.pendingReview > 0;
  return needsReview ? "review" : "published";
}
