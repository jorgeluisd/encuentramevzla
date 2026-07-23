import { describe, expect, it } from "vitest";
import { ENRICH_APPLY_SQL, ENRICH_PREVIEW_SQL } from "./reconciliation-enrich-sql";

// F2 es fill-only: el enriquecimiento NUNCA debe pisar un valor existente en prod.
describe("enrich SQL is fill-only and safe", () => {
  it("only touches MATCH_IDENTICAL (alta confianza), no los conflictos", () => {
    expect(ENRICH_APPLY_SQL).toContain("MATCH_IDENTICAL");
    expect(ENRICH_APPLY_SQL).not.toContain("MATCH_CONFLICT");
    expect(ENRICH_PREVIEW_SQL).toContain("MATCH_IDENTICAL");
  });

  it("uses COALESCE(existing, new) so an existing value is never overwritten", () => {
    expect(ENRICH_APPLY_SQL).toContain("COALESCE(p.normalized_doc_number");
    expect(ENRICH_APPLY_SQL).toContain("COALESCE(p.age");
    // is_minor solo se ELEVA (p.is_minor OR b.is_minor), nunca se baja.
    expect(ENRICH_APPLY_SQL).toContain("p.is_minor OR b.is_minor");
  });

  it("the update only writes to public.patients (+ provenance), never to sensitive", () => {
    expect(ENRICH_APPLY_SQL).toContain("UPDATE public.patients");
    expect(ENRICH_APPLY_SQL).toContain("public.patient_provenance");
    expect(ENRICH_APPLY_SQL).not.toMatch(/sensitive\./);
  });

  it("preview is read-only (SELECT, sin verbos de escritura)", () => {
    expect(/^\s*SELECT/i.test(ENRICH_PREVIEW_SQL)).toBe(true);
    expect(/\b(UPDATE|INSERT|DELETE)\b/i.test(ENRICH_PREVIEW_SQL)).toBe(false);
  });
});
