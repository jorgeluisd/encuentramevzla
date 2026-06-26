import { DocumentId } from "./document-id";

describe("DocumentId", () => {
  it("normalizes to uppercase alphanumeric", () => {
    expect(DocumentId.fromRaw("24.140.952").normalized).toBe("24140952");
  });

  it("is valid with at least 6 digits", () => {
    expect(DocumentId.fromRaw("24.140.952").isValid).toBe(true);
  });

  it("rejects junk documents with too few digits", () => {
    expect(DocumentId.fromRaw("22.89").isValid).toBe(false);
  });

  it("rejects empty documents", () => {
    expect(DocumentId.fromRaw("").isValid).toBe(false);
  });
});
