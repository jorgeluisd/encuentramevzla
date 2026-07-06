import { ServiceTitle } from "./service-title";

describe("ServiceTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(ServiceTitle.fromRaw("  Inspección estructural  ").value).toBe(
      "Inspección estructural",
    );
  });

  it("is valid within [3, 120] chars", () => {
    expect(ServiceTitle.fromRaw("Inspección estructural de edificios").isValid).toBe(true);
  });

  it("rejects too short (< 3)", () => {
    expect(ServiceTitle.fromRaw("ab").isValid).toBe(false);
    expect(ServiceTitle.fromRaw("   ").isValid).toBe(false);
  });

  it("rejects too long (> 120)", () => {
    expect(ServiceTitle.fromRaw("x".repeat(121)).isValid).toBe(false);
  });
});
