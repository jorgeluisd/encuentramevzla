// Etiqueta legible (español) de cada acción del audit_log para la vista de moderador.
// Acciones conocidas hoy las escribe la ingesta; si aparece una nueva, se muestra cruda.
const LABELS: Record<string, string> = {
  ingest_patient_list: "Carga de lista",
  dedup_document_conflict: "Conflicto de cédula",
  dedup_pending_review: "Zona gris (a revisión)",
  review_resolved: "Revisión resuelta",
  patients_merged: "Fusión de pacientes",
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}
