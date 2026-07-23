import type { ParsedPatientList, ParsedPatientRow } from "../../../patient-registry/application/ports/patient-list-parser";
import type { IngestionSummary } from "../../../patient-registry/application/use-cases/ingest-patient-list";
import { ApplyReconciliation, type ReconciliationIngestor } from "./apply-reconciliation";

function row(name: string, isMinor: boolean): ParsedPatientRow {
  return {
    fingerprint: name,
    raw: { APELLIDO: name },
    hospitalName: "Hospital X",
    fullName: name,
    age: null,
    documentNumber: null,
    phone: null,
    address: null,
    clinicalNotes: null,
    isMinor,
  };
}

describe("ApplyReconciliation", () => {
  it("loads importable rows and delegates to the ingestor as one list, propagating the actor", async () => {
    const rows = [row("PEREZ JUAN", false), row("INFANTE X", true)];
    const source = { loadImportable: async (_runId: string) => rows };

    let capturedList: ParsedPatientList | null = null;
    let capturedOpts: { uploadedBy: string | null } | null = null;
    const ingest: ReconciliationIngestor = {
      async ingestParsed(list, opts) {
        capturedList = list;
        capturedOpts = opts;
        return { sheet: list.sheet, rowsRead: list.rows.length, newPatients: list.rows.length } as IngestionSummary;
      },
    };

    const summary = await new ApplyReconciliation({ source, ingest }).execute({
      runId: "run-1",
      actorId: "actor-123",
    });

    expect(capturedList!.rows).toBe(rows);
    expect(capturedList!.sheet).toContain("run-1");
    expect(capturedOpts!.uploadedBy).toBe("actor-123");
    expect(summary.rowsRead).toBe(2);
    // El menor propaga su flag para que la ingesta nunca exponga su nombre.
    expect(rows[1]!.isMinor).toBe(true);
  });
});
