import { ApproveService } from "./approve-service";
import { RejectService } from "./reject-service";
import { ServiceModerationForbiddenError } from "./solidarity-errors";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

const NOW = new Date("2026-08-01T00:00:00.000Z");

describe("ApproveService", () => {
  it("forbids non-moderators", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord());
    const uc = new ApproveService({ repo, now: () => NOW });
    await expect(
      uc.execute({ serviceId: "svc-1", actorRole: "uploader", reviewerId: "m1" }),
    ).rejects.toBeInstanceOf(ServiceModerationForbiddenError);
    expect(repo.updates).toHaveLength(0);
  });

  it("approves and renews expiry to now + 90 days", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord());
    const uc = new ApproveService({ repo, now: () => NOW });
    await uc.execute({ serviceId: "svc-1", actorRole: "moderator", reviewerId: "m1" });
    const row = repo.rows.get("svc-1")!;
    expect(row.status).toBe("approved");
    expect(row.reviewedBy).toBe("m1");
    expect(row.reviewedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.expiresAt.toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });
});

describe("RejectService", () => {
  it("forbids non-moderators", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord());
    const uc = new RejectService({ repo, now: () => NOW });
    await expect(
      uc.execute({ serviceId: "svc-1", actorRole: "hospital_admin", reviewerId: "m1", reason: "spam" }),
    ).rejects.toBeInstanceOf(ServiceModerationForbiddenError);
  });

  it("rejects with a reason", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord());
    const uc = new RejectService({ repo, now: () => NOW });
    await uc.execute({ serviceId: "svc-1", actorRole: "moderator", reviewerId: "m1", reason: "servicio de pago" });
    const row = repo.rows.get("svc-1")!;
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("servicio de pago");
  });
});
