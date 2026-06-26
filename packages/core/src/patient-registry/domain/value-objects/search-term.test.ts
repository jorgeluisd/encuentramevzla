import { buildSearchTerm } from "./search-term";

describe("buildSearchTerm", () => {
  it("combines name and surname with a single space", () => {
    expect(buildSearchTerm({ name: "juan", surname: "perez" })).toBe("juan perez");
  });

  it("prefers the document id when present", () => {
    expect(
      buildSearchTerm({ name: "juan", surname: "perez", documentId: "12345678" }),
    ).toBe("12345678");
  });

  it("trims the document id without further normalization", () => {
    expect(buildSearchTerm({ documentId: "  V-12.345  " })).toBe("V-12.345");
  });

  it("returns an empty string when nothing useful is given", () => {
    expect(buildSearchTerm({ name: "  ", surname: "" })).toBe("");
  });

  it("collapses inner and surrounding whitespace in name and surname", () => {
    expect(
      buildSearchTerm({ name: "  maria  jose ", surname: " rondon " }),
    ).toBe("maria jose rondon");
  });
});
