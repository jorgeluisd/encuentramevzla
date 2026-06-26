import { auditActionLabel } from "./audit-action";

describe("auditActionLabel", () => {
  it("labels the known ingestion actions in Spanish", () => {
    expect(auditActionLabel("ingest_patient_list")).toBe("Carga de lista");
    expect(auditActionLabel("dedup_document_conflict")).toBe("Conflicto de cédula");
    expect(auditActionLabel("dedup_pending_review")).toBe("Zona gris (a revisión)");
    expect(auditActionLabel("review_resolved")).toBe("Revisión resuelta");
    expect(auditActionLabel("patients_merged")).toBe("Fusión de pacientes");
  });

  it("falls back to the raw action when unknown", () => {
    expect(auditActionLabel("something_new")).toBe("something_new");
    expect(auditActionLabel("")).toBe("");
  });
});
