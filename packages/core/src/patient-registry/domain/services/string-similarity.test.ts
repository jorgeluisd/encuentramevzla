import {
  levenshtein,
  tokenSetSimilarity,
  trigramSimilarity,
} from "./string-similarity";

describe("levenshtein", () => {
  it("counts edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("is zero for equal strings", () => {
    expect(levenshtein("ana", "ana")).toBe(0);
  });
});

describe("trigramSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(trigramSimilarity("carlos", "carlos")).toBe(1);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const score = trigramSimilarity("carlos", "carla");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("tokenSetSimilarity", () => {
  it("ignores token order", () => {
    expect(tokenSetSimilarity(["juan", "perez"], ["perez", "juan"])).toBe(1);
  });

  it("is 0 for disjoint token sets", () => {
    expect(tokenSetSimilarity(["ana"], ["luis"])).toBe(0);
  });
});
