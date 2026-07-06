import { SubmitterEmail } from "./submitter-email";

describe("SubmitterEmail", () => {
  it("normalizes to trimmed lowercase", () => {
    expect(SubmitterEmail.fromRaw("  Ana@Example.CO  ").value).toBe("ana@example.co");
  });

  it("is valid for a basic email shape", () => {
    expect(SubmitterEmail.fromRaw("a@b.co").isValid).toBe(true);
  });

  it("rejects missing TLD", () => {
    expect(SubmitterEmail.fromRaw("a@b").isValid).toBe(false);
  });

  it("rejects missing local part or @", () => {
    expect(SubmitterEmail.fromRaw("nope").isValid).toBe(false);
    expect(SubmitterEmail.fromRaw("@b.co").isValid).toBe(false);
  });
});
