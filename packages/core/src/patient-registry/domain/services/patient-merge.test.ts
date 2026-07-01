import { mergedFields, type MergeSide } from "./patient-merge";

const side = (over: Partial<MergeSide> = {}): MergeSide => ({
  documentNormalized: null,
  documentValid: false,
  isMinor: false,
  status: "admitted",
  age: null,
  ...over,
});

describe("mergedFields", () => {
  it("returns no changes when both sides agree", () => {
    expect(mergedFields(side(), side())).toEqual({});
  });

  it("copies the document when the target lacks a valid one and the source has it", () => {
    expect(
      mergedFields(side(), side({ documentNormalized: "12345678", documentValid: true })),
    ).toEqual({ documentNormalized: "12345678" });
  });

  it("never overwrites a valid target document", () => {
    expect(
      mergedFields(
        side({ documentNormalized: "111", documentValid: true }),
        side({ documentNormalized: "222", documentValid: true }),
      ),
    ).toEqual({});
  });

  it("raises isMinor and deceased from the source", () => {
    expect(
      mergedFields(side(), side({ isMinor: true, status: "deceased" })),
    ).toEqual({ isMinor: true, status: "deceased" });
  });

  it("completes a missing age from the source", () => {
    expect(mergedFields(side(), side({ age: 30 }))).toEqual({ age: 30 });
  });

  it("never overwrites an existing target age", () => {
    expect(mergedFields(side({ age: 40 }), side({ age: 30 }))).toEqual({});
  });
});
