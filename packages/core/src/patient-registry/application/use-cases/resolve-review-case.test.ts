import { ResolveReviewCase } from "./resolve-review-case";
import type { AuditEntry, AuditLog } from "../ports/repositories";

class FakeAudit implements AuditLog {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  async recordMany(entries: AuditEntry[]): Promise<void> {
    this.entries.push(...entries);
  }
}

describe("ResolveReviewCase", () => {
  it("records a review_resolved audit entry with the decision", async () => {
    const audit = new FakeAudit();
    await new ResolveReviewCase(audit).execute({
      patientId: "p1",
      decision: "merge",
      candidateId: "p2",
      actorId: "m1",
    });
    expect(audit.entries).toEqual([
      {
        actorId: "m1",
        action: "review_resolved",
        entity: "patient",
        entityId: "p1",
        payload: { decision: "merge", candidateId: "p2" },
      },
    ]);
  });

  it("throws on an invalid decision and records nothing", async () => {
    const audit = new FakeAudit();
    await expect(
      new ResolveReviewCase(audit).execute({
        patientId: "p1",
        decision: "delete",
        actorId: "m1",
      }),
    ).rejects.toThrow();
    expect(audit.entries).toHaveLength(0);
  });
});
