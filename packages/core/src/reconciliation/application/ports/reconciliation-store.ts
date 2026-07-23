import type { ConflictingFields } from "../../domain/services/reconciliation-category";

// Puertos de persistencia. TODA escritura va al esquema aislado `reconciliation`.
// La lectura de producción es SOLO lectura (ver ProductionReadModel: no expone métodos de escritura).

export type RunStatus = "running" | "ingested" | "reconciled" | "completed" | "failed";

export interface ReconciliationRun {
  runId: string;
  sourceFileName: string;
  sourceFileHash: string;
}

export interface StagingRecordInput {
  id: string;
  runId: string;
  sheetName: string;
  sourceRowNumber: number;
  raw: Record<string, string>;
  normalizedName: string;
  nameTokens: readonly string[];
  normalizedDoc: string | null;
  isDocValid: boolean;
  age: number | null;
  sex: string | null;
  isMinor: boolean;
  hasUncertaintyMarker: boolean;
  registeredDateRaw: string | null;
  registeredDate: string | null; // ISO YYYY-MM-DD o null
  centerFromSheet: string;
  centerFromColumn: string | null;
  centerMismatch: boolean;
}

// Fila de staging tal como se relee para reconciliar (subset necesario para el matching).
export interface StagingRecordRow {
  id: string;
  sheetName: string;
  centerCanonical: string;
  normalizedName: string;
  normalizedDoc: string | null;
  age: number | null;
  sex: string | null;
}

export type MatchCategory =
  | "ONLY_IN_SOURCE"
  | "MATCH_IDENTICAL"
  | "MATCH_CONFLICT"
  | "ONLY_IN_PRODUCTION"
  | "DUP_IN_SOURCE";

export type ResolutionStatus = "unreviewed" | "needs_review" | "accepted" | "rejected";

export interface MatchInput {
  id: string;
  runId: string;
  stagingRecordId: string | null;
  productionRecordId: string | null;
  relatedStagingRecordId: string | null;
  category: MatchCategory;
  similarityScore: number | null;
  conflictingFields: ConflictingFields | null;
  resolutionStatus: ResolutionStatus;
}

export interface ReconciliationStore {
  findRunByHash(hash: string): Promise<ReconciliationRun | null>;
  createRun(run: ReconciliationRun): Promise<void>;
  markStatus(runId: string, status: RunStatus): Promise<void>;
  saveStagingRecords(records: readonly StagingRecordInput[]): Promise<void>;
  loadStagingForRun(runId: string): Promise<StagingRecordRow[]>;
  saveMatches(matches: readonly MatchInput[]): Promise<void>;
}

// Candidato de producción para el matching (bloque = centro canónico).
export interface ProductionCandidateRow {
  id: string;
  normalizedName: string;
  normalizedDoc: string | null;
  age: number | null;
  sex: string | null;
  centerCanonical: string;
}

// Paciente de producción para la sección crítica ONLY_IN_PRODUCTION (con procedencia disponible).
export interface ProductionPatientRow {
  id: string;
  normalizedName: string;
  centerCanonical: string;
  centerName: string;
  // Única procedencia disponible hoy en prod (no hay source/ingested_by): timestamp de creación.
  createdAt: string | null;
}

// SOLO LECTURA sobre producción: por contrato no hay métodos de escritura.
export interface ProductionReadModel {
  loadCenterCandidates(centerCanonical: string): Promise<ProductionCandidateRow[]>;
  listAllProduction(): Promise<ProductionPatientRow[]>;
}
