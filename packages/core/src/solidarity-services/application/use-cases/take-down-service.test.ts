import { TakeDownService } from "./take-down-service";
import { ServiceModerationForbiddenError } from "./solidarity-errors";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

const NOW = new Date("2026-08-01T00:00:00.000Z");

describe("TakeDownService", () => {
  it("forbids non-moderators", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    await expect(
      new TakeDownService({ repo, now: () => NOW }).execute({ serviceId: "svc-1", actorRole: "uploader" }),
    ).rejects.toBeInstanceOf(ServiceModerationForbiddenError);
  });

  it("removes the publication and clears the report flag", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved", reported: true, reportedAt: NOW }));
    await new TakeDownService({ repo, now: () => NOW }).execute({
      serviceId: "svc-1",
      actorRole: "moderator",
    });
    const row = repo.rows.get("svc-1")!;
    expect(row.status).toBe("removed");
    expect(row.reported).toBe(false);
  });
});
