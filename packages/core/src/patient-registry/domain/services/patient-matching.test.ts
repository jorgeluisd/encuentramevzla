import { DocumentId } from "../value-objects/document-id";
import { NormalizedPhone } from "../value-objects/normalized-phone";
import { PersonName } from "../value-objects/person-name";
import {
  decideMatch,
  mostSimilarByName,
  nameSimilarity,
  type MatchCandidate,
} from "./patient-matching";

interface Opts {
  phone?: string;
  age?: number;
  hospitals?: string[];
}

const candidate = (id: string, name: string, doc: string | null, opts: Opts = {}): MatchCandidate => ({
  id,
  name: PersonName.fromRaw(name),
  document: doc === null ? null : DocumentId.fromRaw(doc),
  phone: opts.phone ? NormalizedPhone.fromRaw(opts.phone) : null,
  age: opts.age ?? null,
  ...(opts.hospitals ? { hospitalIds: new Set(opts.hospitals) } : {}),
});

describe("nameSimilarity", () => {
  it("is 1 for identical names", () => {
    expect(nameSimilarity(PersonName.fromRaw("Ana"), PersonName.fromRaw("Ana"))).toBe(1);
  });
  it("is 0 for disjoint names", () => {
    expect(nameSimilarity(PersonName.fromRaw("Ana"), PersonName.fromRaw("Luis"))).toBe(0);
  });
  it("stays positive when only the order changes", () => {
    const score = nameSimilarity(
      PersonName.fromRaw("Juan Perez"),
      PersonName.fromRaw("Perez Juan"),
    );
    expect(score).toBeGreaterThan(0.5);
  });
});

describe("decideMatch", () => {
  const incoming = (name: string, doc: string | null, opts: Opts = {}) => ({
    name: PersonName.fromRaw(name),
    document: doc === null ? null : DocumentId.fromRaw(doc),
    phone: opts.phone ? NormalizedPhone.fromRaw(opts.phone) : null,
    age: opts.age ?? null,
  });

  // Política conservadora (0020, ADR-0004): el nombre por sí solo NUNCA fusiona.
  it("sends an identical name without any strong signal to review", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", null), [candidate("p1", "Carlos Mendoza", null)]),
    ).toEqual({ kind: "review" });
  });

  it("creates new for a disjoint name", () => {
    expect(
      decideMatch(incoming("Ana Luisa", null), [candidate("p1", "Carlos Mendoza", null)]),
    ).toEqual({ kind: "new" });
  });

  it("merges by valid document when the name agrees", () => {
    expect(
      decideMatch(incoming("Carlos M", "24.140.952"), [candidate("p1", "Carlos M", "24140952")]),
    ).toEqual({ kind: "merge", targetId: "p1" });
  });

  it("flags a conflict when the same document has a different person (ADR-003)", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "24140952"), [candidate("p1", "Rosa Diaz", "24.140.952")]),
    ).toEqual({ kind: "conflict" });
  });

  it("ignores junk documents and falls back to the name → review (no strong signal)", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "22.89"), [candidate("p1", "Carlos Mendoza", "22.89")]),
    ).toEqual({ kind: "review" });
  });

  it("sends to review when both documents differ by only a few digits (likely typo)", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "11111111"), [
        candidate("p1", "Carlos Mendoza", "11111133"),
      ]),
    ).toEqual({ kind: "review" });
  });

  it("creates new when both documents differ a lot (different people)", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "11111111"), [
        candidate("p1", "Carlos Mendoza", "99999999"),
      ]),
    ).toEqual({ kind: "new" });
  });

  it("still merges an identical name when only one side has a valid document", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "11111111"), [candidate("p1", "Carlos Mendoza", null)]),
    ).toEqual({ kind: "merge", targetId: "p1" });
    expect(
      decideMatch(incoming("Carlos Mendoza", null), [candidate("p1", "Carlos Mendoza", "11111111")]),
    ).toEqual({ kind: "merge", targetId: "p1" });
  });

  it("sends same name without document in the SAME hospital to review (possible homonym)", () => {
    expect(
      decideMatch(
        incoming("Carlos Mendoza", null),
        [candidate("p1", "Carlos Mendoza", null, { hospitals: ["H1"] })],
        "H1",
      ),
    ).toEqual({ kind: "review" });
  });

  it("creates new for same name without document in a DIFFERENT hospital", () => {
    expect(
      decideMatch(
        incoming("Carlos Mendoza", null),
        [candidate("p1", "Carlos Mendoza", null, { hospitals: ["H1"] })],
        "H2",
      ),
    ).toEqual({ kind: "new" });
  });

  // Caso 5 (0020): mismo teléfono + nombre alto = misma persona, incluso entre hospitales.
  it("merges on matching phone across different hospitals (a transfer, not a duplicate)", () => {
    expect(
      decideMatch(
        incoming("Carlos Mendoza", null, { phone: "0414-1234567" }),
        [candidate("p1", "Carlos Mendoza", null, { phone: "4141234567", hospitals: ["H1"] })],
        "H2",
      ),
    ).toEqual({ kind: "merge", targetId: "p1" });
  });

  it("does not let a shared phone merge two different valid documents", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "11111111", { phone: "0414-1234567" }), [
        candidate("p1", "Carlos Mendoza", "22222222", { phone: "4141234567" }),
      ]),
    ).toEqual({ kind: "new" });
  });

  // La edad separa homónimos (nunca fusiona): mismo nombre + mismo hospital pero edades lejanas.
  it("creates new for same name and hospital when ages are far apart (homonyms)", () => {
    expect(
      decideMatch(
        incoming("Carlos Mendoza", null, { age: 8 }),
        [candidate("p1", "Carlos Mendoza", null, { age: 40, hospitals: ["H1"] })],
        "H1",
      ),
    ).toEqual({ kind: "new" });
  });
});

describe("mostSimilarByName", () => {
  it("returns null when there are no candidates", () => {
    expect(mostSimilarByName(PersonName.fromRaw("Juan Perez"), [])).toBeNull();
  });

  it("picks the highest-similarity candidate", () => {
    const result = mostSimilarByName(PersonName.fromRaw("Juan Perez"), [
      candidate("a", "Carlos Gomez", null),
      candidate("b", "Juan Peres", null),
      candidate("c", "Ana Lopez", null),
    ]);
    expect(result?.candidate.id).toBe("b");
    expect(result?.score).toBeGreaterThan(0.5);
  });
});
