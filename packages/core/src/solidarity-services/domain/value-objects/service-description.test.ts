import { ServiceDescription } from "./service-description";

describe("ServiceDescription", () => {
  it("trims surrounding whitespace", () => {
    expect(ServiceDescription.fromRaw("  ofrezco ayuda  ").value).toBe("ofrezco ayuda");
  });

  it("is valid within [10, 1000] chars", () => {
    expect(ServiceDescription.fromRaw("x".repeat(200)).isValid).toBe(true);
  });

  it("rejects too short (< 10)", () => {
    expect(ServiceDescription.fromRaw("corto").isValid).toBe(false);
  });

  it("rejects too long (> 1000)", () => {
    expect(ServiceDescription.fromRaw("x".repeat(1001)).isValid).toBe(false);
  });
});
