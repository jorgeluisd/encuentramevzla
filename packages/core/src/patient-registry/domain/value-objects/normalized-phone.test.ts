import { NormalizedPhone } from "./normalized-phone";

describe("NormalizedPhone", () => {
  it("keeps only digits", () => {
    expect(NormalizedPhone.fromRaw("0414-123.4567").normalized).toBe("04141234567");
  });

  it("is valid only with at least 7 digits", () => {
    expect(NormalizedPhone.fromRaw("1234567").isValid).toBe(true);
    expect(NormalizedPhone.fromRaw("12 34 5").isValid).toBe(false);
    expect(NormalizedPhone.fromRaw("").isValid).toBe(false);
  });

  it("matches ignoring country prefix and leading zero (last 7 digits)", () => {
    const a = NormalizedPhone.fromRaw("0414-1234567");
    expect(a.equals(NormalizedPhone.fromRaw("4141234567"))).toBe(true);
    expect(a.equals(NormalizedPhone.fromRaw("+58 414 1234567"))).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(
      NormalizedPhone.fromRaw("0414-1234567").equals(NormalizedPhone.fromRaw("0424-7654321")),
    ).toBe(false);
  });

  it("an invalid phone never matches, even against itself", () => {
    expect(NormalizedPhone.fromRaw("123").equals(NormalizedPhone.fromRaw("123"))).toBe(false);
  });
});
