import type { ParsedPatientList } from "../../../patient-registry/application/ports/patient-list-parser";
import type { IngestionSummary } from "../../../patient-registry/application/use-cases/ingest-patient-list";
import type { ReconciliationImportSource } from "../ports/reconciliation-import-source";

// Ingestor mínimo que satisface IngestPatientList (evita acoplar a la clase concreta).
export interface ReconciliationIngestor {
  ingestParsed(
    list: ParsedPatientList,
    opts: { uploadedBy: string | null },
  ): Promise<IngestionSummary>;
}

export interface ApplyReconciliationInput {
  runId: string;
  actorId: string | null; // team_members.id del lote (audit)
}

export interface ApplyReconciliationDeps {
  source: ReconciliationImportSource;
  ingest: ReconciliationIngestor;
}

// Importa a producción los ONLY_IN_SOURCE del diagnóstico REUSANDO el motor de ingesta
// (dedup real, resolución de hospital, menor/fallecido, sensitive, procedencia). No reinventa
// nada: arma un ParsedPatientList desde el staging y delega en IngestPatientList (ADR-0009 F1).
export class ApplyReconciliation {
  constructor(private readonly deps: ApplyReconciliationDeps) {}

  async execute(input: ApplyReconciliationInput): Promise<IngestionSummary> {
    const rows = await this.deps.source.loadImportable(input.runId);
    const list: ParsedPatientList = { sheet: `reconciliation-import:${input.runId}`, rows };
    return this.deps.ingest.ingestParsed(list, { uploadedBy: input.actorId });
  }
}
