import { PersonName } from "../../../patient-registry/domain/value-objects/person-name";
import {
  categorize,
  type ProductionCandidate,
  type ReconciliationIdentity,
} from "./reconciliation-category";

function identity(
  name: string,
  opts: Partial<Omit<ReconciliationIdentity, "name">> = {},
): ReconciliationIdentity {
  return {
    name: PersonName.fromRaw(name),
    doc: opts.doc ?? null,
    age: opts.age ?? null,
    sex: opts.sex ?? null,
    center: opts.center ?? "perez carreno",
  };
}
function candidate(id: string, name: string, opts: Partial<Omit<ProductionCandidate, "name" | "id">> = {}): ProductionCandidate {
  return { id, ...identity(name, opts) };
}

describe("categorize", () => {
  it("ONLY_IN_SOURCE when there is no candidate above the floor", () => {
    const result = categorize(identity("PEREZ JUAN"), [candidate("p1", "RODRIGUEZ MARIA")]);
    expect(result.category).toBe("ONLY_IN_SOURCE");
    expect(result.productionRecordId).toBeNull();
  });

  it("ONLY_IN_SOURCE with empty production", () => {
    expect(categorize(identity("PEREZ JUAN"), []).category).toBe("ONLY_IN_SOURCE");
  });

  it("MATCH_IDENTICAL when name matches and no comparable field conflicts", () => {
    const result = categorize(
      identity("PEREZ JUAN", { doc: "24140952", age: 35, sex: "M" }),
      [candidate("p1", "PEREZ JUAN", { doc: "24140952", age: 35, sex: "M" })],
    );
    expect(result.category).toBe("MATCH_IDENTICAL");
    expect(result.productionRecordId).toBe("p1");
    expect(result.conflictingFields).toBeNull();
    expect(result.needsReview).toBe(false);
  });

  it("tolerates word order and accents/ñ in the identical case", () => {
    const result = categorize(
      identity("PEÑA JOSÉ", { doc: "24140952" }),
      [candidate("p1", "Jose Peña", { doc: "0024140952" })], // orden distinto + cero a la izquierda
    );
    expect(result.category).toBe("MATCH_IDENTICAL");
  });

  it("MATCH_CONFLICT when names match but a field diverges (age / sex / centro)", () => {
    const result = categorize(
      identity("PEREZ JUAN", { doc: "24140952", age: 35, sex: "M" }),
      [candidate("p1", "PEREZ JUAN", { doc: "24140952", age: 70, sex: "F" })],
    );
    expect(result.category).toBe("MATCH_CONFLICT");
    expect(result.needsReview).toBe(true);
    expect(result.conflictingFields).toMatchObject({
      edad: { source: 35, production: 70 },
      sexo: { source: "M", production: "F" },
    });
  });

  it("ALERT: same cédula with divergent names → MATCH_CONFLICT flagged for review", () => {
    const result = categorize(
      identity("PEREZ JUAN", { doc: "24140952" }),
      [candidate("p1", "GONZALEZ PEDRO", { doc: "24140952" })],
    );
    expect(result.category).toBe("MATCH_CONFLICT");
    expect(result.needsReview).toBe(true);
    expect(result.conflictingFields).toHaveProperty("nombre");
  });

  it("same name + different valid cédula → conflict on cédula", () => {
    const result = categorize(
      identity("PEREZ JUAN", { doc: "24140952" }),
      [candidate("p1", "PEREZ JUAN", { doc: "11223344" })],
    );
    expect(result.category).toBe("MATCH_CONFLICT");
    expect(result.conflictingFields).toHaveProperty("cedula");
  });

  it("mid-confidence name (0.72–0.92) goes to review, not silently identical", () => {
    const result = categorize(identity("PEREZ JUAN CARLOS"), [candidate("p1", "PEREZ JUAN")]);
    expect(["MATCH_CONFLICT", "ONLY_IN_SOURCE"]).toContain(result.category);
    if (result.category === "MATCH_CONFLICT") expect(result.needsReview).toBe(true);
  });
});
