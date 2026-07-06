import { SERVICE_CATEGORIES, ServiceCategory } from "./service-category";

describe("ServiceCategory", () => {
  it("accepts a value from the fixed list", () => {
    expect(ServiceCategory.fromRaw("Legal y notarial").isValid).toBe(true);
  });

  it("accepts the escape hatch 'Otro'", () => {
    expect(ServiceCategory.fromRaw("Otro").isValid).toBe(true);
  });

  it("rejects a value outside the fixed list", () => {
    expect(ServiceCategory.fromRaw("Cripto").isValid).toBe(false);
  });

  it("rejects empty", () => {
    expect(ServiceCategory.fromRaw("").isValid).toBe(false);
  });

  it("exposes the catalog and includes 'Otro'", () => {
    expect(SERVICE_CATEGORIES).toContain("Otro");
    expect(SERVICE_CATEGORIES.length).toBeGreaterThan(10);
  });
});
