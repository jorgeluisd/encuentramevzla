import { normalizeHospitalName } from "../../../patient-registry/domain/services/hospital-name";
import { PersonName } from "../../../patient-registry/domain/value-objects/person-name";
import { normalizeCedulaCell } from "../../domain/services/cedula-cell";
import { rowHasUncertaintyMarker } from "../../domain/services/uncertainty-marker";
import { RegisteredDate } from "../../domain/value-objects/registered-date";
import type { ConsolidatedSourceReader } from "../ports/consolidated-source-reader";
import type { ReconciliationStore, StagingRecordInput } from "../ports/reconciliation-store";

export interface IngestSummary {
  runId: string;
  sheets: number;
  rowsRead: number;
  recordsStaged: number;
  withValidCedula: number;
  minors: number;
  withUncertainty: number;
  centerMismatches: number;
  datesParsed: number;
}

export interface IngestInput {
  fileBytes: Uint8Array;
  sourceFileName: string;
  sourceFileHash: string; // SHA-256 del archivo (idempotencia)
  runId: string;
  force?: boolean;
}

export interface IngestConsolidatedDependencies {
  reader: ConsolidatedSourceReader;
  store: ReconciliationStore;
  newId: () => string;
}

// Re-ingerir el mismo hash aborta con mensaje claro salvo --force.
export class DuplicateSourceError extends Error {
  constructor(
    readonly sourceFileHash: string,
    readonly existingRunId: string,
  ) {
    super(
      `Este archivo (hash ${sourceFileHash.slice(0, 12)}…) ya se ingirió en la corrida ` +
        `${existingRunId}. Usá --force para re-ingerirlo en una corrida nueva.`,
    );
    this.name = "DuplicateSourceError";
  }
}

export class IngestConsolidatedSource {
  constructor(private readonly deps: IngestConsolidatedDependencies) {}

  async execute(input: IngestInput): Promise<IngestSummary> {
    const { reader, store, newId } = this.deps;

    if (!input.force) {
      const existing = await store.findRunByHash(input.sourceFileHash);
      if (existing) throw new DuplicateSourceError(input.sourceFileHash, existing.runId);
    }

    // Puede lanzar MissingColumnsError (falla ruidosa): se propaga, no se ingiere nada.
    const source = reader.read(input.fileBytes);

    const records: StagingRecordInput[] = [];
    const summary: IngestSummary = {
      runId: input.runId,
      sheets: source.sheets.length,
      rowsRead: 0,
      recordsStaged: 0,
      withValidCedula: 0,
      minors: 0,
      withUncertainty: 0,
      centerMismatches: 0,
      datesParsed: 0,
    };

    for (const sheet of source.sheets) {
      for (const row of sheet.rows) {
        summary.rowsRead++;
        const name = PersonName.fromRaw(`${row.surname} ${row.givenName}`);
        if (name.isEmpty) continue; // sin nombre no hay registro comparable

        const cedula = normalizeCedulaCell(row.cedula);
        const age = parseAge(row.age);
        const sex = normalizeSex(row.sex);
        const isMinor = cedula.isMinorSentinel || name.flaggedMinor || (age != null && age < 18);
        const hasUncertainty = rowHasUncertaintyMarker(Object.values(row.raw));
        const registeredDateRaw = emptyToNull(row.registeredDateRaw);
        const registeredDate = RegisteredDate.fromRaw(row.registeredDateRaw).iso;

        const centerFromColumn = emptyToNull(row.currentCenter);
        // La PESTAÑA es autoritativa; CENTRO ACTUAL solo verifica. Se registra la discrepancia.
        const centerMismatch =
          centerFromColumn != null &&
          normalizeHospitalName(centerFromColumn) !== "" &&
          normalizeHospitalName(centerFromColumn) !== normalizeHospitalName(sheet.sheetName);

        records.push({
          id: newId(),
          runId: input.runId,
          sheetName: sheet.sheetName,
          sourceRowNumber: row.sourceRowNumber,
          raw: row.raw,
          normalizedName: name.normalized,
          nameTokens: name.tokens,
          normalizedDoc: cedula.normalized,
          isDocValid: cedula.isDocValid,
          age,
          sex,
          isMinor,
          hasUncertaintyMarker: hasUncertainty,
          registeredDateRaw,
          registeredDate,
          centerFromSheet: sheet.sheetName,
          centerFromColumn,
          centerMismatch,
        });

        summary.recordsStaged++;
        if (cedula.isDocValid) summary.withValidCedula++;
        if (isMinor) summary.minors++;
        if (hasUncertainty) summary.withUncertainty++;
        if (centerMismatch) summary.centerMismatches++;
        if (registeredDate) summary.datesParsed++;
      }
    }

    await store.createRun({
      runId: input.runId,
      sourceFileName: input.sourceFileName,
      sourceFileHash: input.sourceFileHash,
    });
    await store.saveStagingRecords(records);
    await store.markStatus(input.runId, "ingested");

    return summary;
  }
}

function parseAge(value: string): number | null {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  if (Number.isNaN(n) || n < 0 || n > 120) return null;
  return n;
}

function normalizeSex(value: string): string | null {
  const first = (value ?? "").trim().toUpperCase().charAt(0);
  if (first === "M") return "M";
  if (first === "F") return "F";
  return null;
}

function emptyToNull(value: string): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
