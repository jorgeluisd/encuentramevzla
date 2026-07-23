import { rowHasUncertaintyMarker, textHasUncertaintyMarker } from "./uncertainty-marker";

describe("uncertainty markers", () => {
  it("detects [?] and [ILEGIBLE] (case/space tolerant)", () => {
    expect(textHasUncertaintyMarker("PEREZ [?]")).toBe(true);
    expect(textHasUncertaintyMarker("[ ? ]")).toBe(true);
    expect(textHasUncertaintyMarker("cedula [ILEGIBLE]")).toBe(true);
    expect(textHasUncertaintyMarker("[ilegible]")).toBe(true);
  });

  it("ignores plain text without the bracketed markers", () => {
    expect(textHasUncertaintyMarker("PEREZ JUAN")).toBe(false);
    expect(textHasUncertaintyMarker("por que?")).toBe(false);
    expect(textHasUncertaintyMarker("")).toBe(false);
  });

  it("flags a row if any cell carries a marker", () => {
    expect(rowHasUncertaintyMarker(["PEREZ", "JUAN", "24140952"])).toBe(false);
    expect(rowHasUncertaintyMarker(["PEREZ", "[?]", "24140952"])).toBe(true);
  });
});
