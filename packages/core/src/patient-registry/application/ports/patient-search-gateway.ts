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
  | { kind: "rate-limited" }
  | { kind: "matches"; matches: MediatedMatch[] };

// Búsqueda MEDIADA: la implementa el RPC SECURITY DEFINER (infraestructura).
// clientId: hash de la IP (anti-abuso); el RPC lo usa para el rate-limit por fuente.
export interface PatientSearchGateway {
  search(term: string, clientId?: string): Promise<MediatedSearchResult>;
}
