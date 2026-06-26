import { ingestionDisplayStatus } from "./ingestion-status";
import type { IngestionSummary } from "./ingest-patient-list";

// Resumen base "limpio" (sin conflictos ni zona gris).
const base: IngestionSummary = {
  sheet: "Hoja1",
  rowsRead: 10,
  uniqueRows: 10,
  newRows: 10,
  alreadyPresent: 0,
  hospitals: 1,
  newPatients: 10,
  mergedPatients: 0,
  documentConflicts: 0,
  pendingReview: 0,
  newAdmissions: 10,
  minors: 0,
  deceased: 0,
};

describe("ingestionDisplayStatus", () => {
  it("returns 'published' when there is nothing to review", () => {
    expect(ingestionDisplayStatus(base)).toBe("published");
  });

  it("returns 'review' when there are document conflicts", () => {
    expect(ingestionDisplayStatus({ ...base, documentConflicts: 2 })).toBe("review");
  });

  it("returns 'review' when there are grey-zone rows pending review", () => {
    expect(ingestionDisplayStatus({ ...base, pendingReview: 3 })).toBe("review");
  });
});
