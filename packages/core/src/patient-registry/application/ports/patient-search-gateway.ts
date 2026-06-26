export interface MediatedMatch {
  hospitalName: string;
  infoDeskPhone: string | null;
  confidence: number;
}

export type MediatedSearchResult =
  | { kind: "invalid-term" }
  | { kind: "human-contact" }
  | { kind: "no-results" }
  | { kind: "matches"; matches: MediatedMatch[] };

// Búsqueda MEDIADA: la implementa el RPC SECURITY DEFINER (infraestructura).
export interface PatientSearchGateway {
  search(term: string): Promise<MediatedSearchResult>;
}
