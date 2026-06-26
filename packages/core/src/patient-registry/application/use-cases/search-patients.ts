import type {
  MediatedSearchResult,
  PatientSearchGateway,
} from "../ports/patient-search-gateway";

const MIN_TERM_LENGTH = 4;

// Caso de uso de búsqueda: valida el término y delega en la búsqueda mediada.
export class SearchPatients {
  constructor(private readonly gateway: PatientSearchGateway) {}

  async execute(rawTerm: string): Promise<MediatedSearchResult> {
    const term = rawTerm.trim();
    if (term.length < MIN_TERM_LENGTH) return { kind: "invalid-term" };
    return this.gateway.search(term);
  }
}
