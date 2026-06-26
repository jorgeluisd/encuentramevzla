export interface MediatedMatch {
  hospitalName: string;
  infoDeskPhone: string | null;
  // Nombre normalizado del adulto coincidente; la presentación lo pasa por displayName().
  patientName: string;
  confidence: number;
}

export type MediatedSearchResult =
  | { kind: "invalid-term" }
  | { kind: "no-results" }
  | { kind: "matches"; matches: MediatedMatch[] };

// Búsqueda MEDIADA: la implementa el RPC SECURITY DEFINER (infraestructura).
export interface PatientSearchGateway {
  search(term: string): Promise<MediatedSearchResult>;
}
