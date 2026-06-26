import { DocumentId } from "../value-objects/document-id";
import { PersonName } from "../value-objects/person-name";
import {
  decideMatch,
  mostSimilarByName,
  nameSimilarity,
  type MatchCandidate,
} from "./patient-matching";

const candidate = (id: string, name: string, doc: string | null): MatchCandidate => ({
  id,
  name: PersonName.fromRaw(name),
  document: doc === null ? null : DocumentId.fromRaw(doc),
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
  const incoming = (name: string, doc: string | null) => ({
    name: PersonName.fromRaw(name),
    document: doc === null ? null : DocumentId.fromRaw(doc),
  });

  it("merges an identical name without document", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", null), [candidate("p1", "Carlos Mendoza", null)]),
    ).toEqual({ kind: "merge", targetId: "p1" });
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

  it("ignores junk documents and falls back to the name", () => {
    expect(
      decideMatch(incoming("Carlos Mendoza", "22.89"), [candidate("p1", "Carlos Mendoza", "22.89")]),
    ).toEqual({ kind: "merge", targetId: "p1" });
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
