// Caso dudoso marcado por la dedup, aún sin resolver.
export interface ReviewFlag {
  patientId: string;
  name: string; // normalizado
  document: string | null;
  reason: "document_conflict" | "pending_review";
}

// Datos mínimos de un paciente para mostrar candidatos.
export interface PatientBrief {
  id: string;
  name: string;
  document: string | null;
  hospitals?: string[]; // hospitales con ingreso (para el detalle de "Más info")
}

// Port de LECTURA de la cola (la resolución se escribe por el port AuditLog).
export interface ReviewQueueReader {
  listOpenFlags(): Promise<ReviewFlag[]>; // dedup_* sin review_resolved
  findByDocument(document: string): Promise<PatientBrief[]>;
  loadBriefs(): Promise<PatientBrief[]>; // para recompute de zona gris
  // Hospitales (por nombre) de cada paciente; para mostrar dónde están los duplicados.
  hospitalsOf(patientIds: readonly string[]): Promise<Map<string, string[]>>;
}
