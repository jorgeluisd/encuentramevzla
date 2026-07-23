import type {
  ConsolidatedRawRow,
  ConsolidatedSource,
  ConsolidatedSourceReader,
} from "../ports/consolidated-source-reader";
import { MissingColumnsError } from "../ports/consolidated-source-reader";
import type {
  MatchInput,
  ProductionCandidateRow,
  ProductionPatientRow,
  ProductionReadModel,
  ReconciliationRun,
  ReconciliationStore,
  RunStatus,
  StagingRecordInput,
  StagingRecordRow,
} from "../ports/reconciliation-store";

// newId determinista para tests.
export function counterId(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// Fila cruda mínima con las columnas comunes; el resto se completa vacío.
export function rawRow(
  sheetName: string,
  sourceRowNumber: number,
  fields: Partial<Omit<ConsolidatedRawRow, "sheetName" | "sourceRowNumber" | "raw">> & {
    raw?: Record<string, string>;
  },
): ConsolidatedRawRow {
  const { raw: rawOverride, ...rest } = fields;
  const base = {
    surname: "",
    givenName: "",
    cedula: "",
    age: "",
    sex: "",
    origin: "",
    currentCenter: "",
    notes: "",
    registeredDateRaw: "",
    registeredTimeRaw: "",
    ...rest,
  };
  return {
    sheetName,
    sourceRowNumber,
    raw: rawOverride ?? { ...base },
    surname: base.surname,
    givenName: base.givenName,
    cedula: base.cedula,
    age: base.age,
    sex: base.sex,
    origin: base.origin,
    currentCenter: base.currentCenter,
    notes: base.notes,
    registeredDateRaw: base.registeredDateRaw,
    registeredTimeRaw: base.registeredTimeRaw,
  };
}

export class FakeReader implements ConsolidatedSourceReader {
  constructor(private readonly source: ConsolidatedSource) {}
  read(): ConsolidatedSource {
    return this.source;
  }
}

export class ThrowingReader implements ConsolidatedSourceReader {
  constructor(
    private readonly sheet: string,
    private readonly missing: string[],
  ) {}
  read(): ConsolidatedSource {
    throw new MissingColumnsError(this.sheet, this.missing);
  }
}

// Store en memoria que ETIQUETA cada escritura con su tabla `reconciliation.*`.
export class FakeStore implements ReconciliationStore {
  readonly runs = new Map<string, ReconciliationRun & { status: RunStatus }>();
  readonly staging: StagingRecordInput[] = [];
  readonly matches: MatchInput[] = [];
  readonly writeTargets: string[] = [];

  async findRunByHash(hash: string): Promise<ReconciliationRun | null> {
    return [...this.runs.values()].find((r) => r.sourceFileHash === hash) ?? null;
  }
  async createRun(run: ReconciliationRun): Promise<void> {
    this.writeTargets.push("reconciliation.reconciliation_run");
    this.runs.set(run.runId, { ...run, status: "running" });
  }
  async markStatus(runId: string, status: RunStatus): Promise<void> {
    this.writeTargets.push("reconciliation.reconciliation_run");
    const run = this.runs.get(runId);
    if (run) run.status = status;
  }
  async saveStagingRecords(records: readonly StagingRecordInput[]): Promise<void> {
    this.writeTargets.push("reconciliation.staging_patient_record");
    this.staging.push(...records);
  }
  async loadStagingForRun(runId: string): Promise<StagingRecordRow[]> {
    return this.staging
      .filter((r) => r.runId === runId)
      .map((r) => ({
        id: r.id,
        sheetName: r.sheetName,
        centerCanonical: r.centerFromSheet, // clave de bloque opaca (en prod la resuelve el adapter)
        normalizedName: r.normalizedName,
        normalizedDoc: r.normalizedDoc,
        age: r.age,
        sex: r.sex,
      }));
  }
  async saveMatches(matches: readonly MatchInput[]): Promise<void> {
    this.writeTargets.push("reconciliation.reconciliation_match");
    this.matches.push(...matches);
  }
}

export class FakeProduction implements ProductionReadModel {
  readonly reads: string[] = [];
  constructor(
    private readonly candidatesByCenter: Map<string, ProductionCandidateRow[]>,
    private readonly all: ProductionPatientRow[],
  ) {}
  async loadCenterCandidates(centerCanonical: string): Promise<ProductionCandidateRow[]> {
    this.reads.push(`read:candidates:${centerCanonical}`);
    return this.candidatesByCenter.get(centerCanonical) ?? [];
  }
  async listAllProduction(): Promise<ProductionPatientRow[]> {
    this.reads.push("read:all");
    return this.all;
  }
}
