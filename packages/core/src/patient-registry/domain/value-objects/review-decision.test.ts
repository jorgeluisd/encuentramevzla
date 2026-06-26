import { isReviewDecision } from "./review-decision";

describe("isReviewDecision", () => {
  it("accepts the known decisions", () => {
    expect(isReviewDecision("merge")).toBe(true);
    expect(isReviewDecision("keep")).toBe(true);
    expect(isReviewDecision("more_info")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isReviewDecision("delete")).toBe(false);
    expect(isReviewDecision("")).toBe(false);
    expect(isReviewDecision("Merge")).toBe(false);
  });
});
