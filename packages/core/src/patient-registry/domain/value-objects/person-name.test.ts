import { PersonName } from "./person-name";

describe("PersonName", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(PersonName.fromRaw("Pérez Júan").normalized).toBe("perez juan");
  });

  it("produces an order-insensitive token set", () => {
    const a = PersonName.fromRaw("Juan Pérez").tokens;
    const b = PersonName.fromRaw("Pérez Juan").tokens;
    expect(a).toEqual(["juan", "perez"]);
    expect(a).toEqual(b);
  });

  it("flags blank names as empty", () => {
    expect(PersonName.fromRaw("   ").isEmpty).toBe(true);
  });

  it("strips the exact word 'menor' (privacy: never expose minor status)", () => {
    expect(PersonName.fromRaw("Juan Menor").normalized).toBe("juan");
    expect(PersonName.fromRaw("Pedro Perez MENOR").tokens).toEqual(["pedro", "perez"]);
    // 'menor' suelto deja el nombre vacío.
    expect(PersonName.fromRaw("menor").isEmpty).toBe(true);
  });

  it("does NOT strip words that merely contain 'menor'", () => {
    expect(PersonName.fromRaw("Maria Menores").normalized).toBe("maria menores");
  });
});
