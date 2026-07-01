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

// Entrada de paginación: acota a la página del actor (scope) y a una ventana (limit/offset).
export interface ListOpenFlagsInput {
  scopeHospitalId?: string | null; // null/ausente = moderador global (sin filtro por hospital)
  limit: number;
  offset: number;
}

// Página de flags abiertos + total de la cola (para calcular cuántas páginas hay).
export interface OpenFlagsPage {
  flags: ReviewFlag[];
  total: number;
}

// Port de LECTURA de la cola (la resolución se escribe por el port AuditLog).
export interface ReviewQueueReader {
  // Paginado y acotado en SQL: solo trae la ventana pedida (dedup_* sin review_resolved).
  listOpenFlags(input: ListOpenFlagsInput): Promise<OpenFlagsPage>;
  findByDocument(document: string): Promise<PatientBrief[]>;
  loadBriefs(): Promise<PatientBrief[]>; // para recompute de zona gris
  // Hospitales (por nombre) de cada paciente; para mostrar dónde están los duplicados.
  hospitalsOf(patientIds: readonly string[]): Promise<Map<string, string[]>>;
  // IDs de hospital (no nombres) de cada paciente; para acotar la cola al hospital del actor.
  hospitalIdsOf(patientIds: readonly string[]): Promise<Map<string, string[]>>;
}
