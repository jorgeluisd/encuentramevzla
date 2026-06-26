import { displayName } from "./display-name";

describe("displayName", () => {
  it("title-cases each word of a normalized name", () => {
    expect(displayName("perez garcia juan")).toBe("Perez Garcia Juan");
  });

  it("collapses surrounding and inner whitespace", () => {
    expect(displayName("  juan  perez ")).toBe("Juan Perez");
  });

  it("returns an empty string for blank input", () => {
    expect(displayName("")).toBe("");
    expect(displayName("   ")).toBe("");
  });
});
