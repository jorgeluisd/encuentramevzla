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
});
