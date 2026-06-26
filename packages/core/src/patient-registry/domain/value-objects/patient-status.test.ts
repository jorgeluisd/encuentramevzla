import { isMinorAge, looksDeceased, requiresHumanContact } from "./patient-status";

describe("isMinorAge", () => {
  it("is true under 18", () => expect(isMinorAge(10)).toBe(true));
  it("is false at 18 or older", () => expect(isMinorAge(18)).toBe(false));
  it("is false when unknown", () => expect(isMinorAge(null)).toBe(false));
});

describe("looksDeceased", () => {
  it("detects deceased notes", () => expect(looksDeceased("paciente falleció")).toBe(true));
  it("ignores unrelated notes", () => expect(looksDeceased("estable")).toBe(false));
  it("handles missing notes", () => expect(looksDeceased(null)).toBe(false));
});

describe("requiresHumanContact", () => {
  it("routes minors to human contact", () =>
    expect(requiresHumanContact({ isMinor: true, status: "admitted" })).toBe(true));
  it("routes deceased to human contact", () =>
    expect(requiresHumanContact({ isMinor: false, status: "deceased" })).toBe(true));
  it("lets regular adults through", () =>
    expect(requiresHumanContact({ isMinor: false, status: "admitted" })).toBe(false));
});
