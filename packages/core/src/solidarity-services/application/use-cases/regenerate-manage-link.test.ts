import { RegenerateManageLink } from "./regenerate-manage-link";
import { ServiceModerationForbiddenError, ServiceNotFoundError } from "./solidarity-errors";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

const NOW = new Date("2026-08-01T00:00:00.000Z");

function makeUseCase(repo: InMemoryRepo) {
  return new RegenerateManageLink({
    repo,
    newToken: () => "fresh-token",
    hashToken: (t) => `hash(${t})`,
    now: () => NOW,
  });
}

describe("RegenerateManageLink", () => {
  it("forbids non-moderators", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    await expect(
      makeUseCase(repo).execute({ serviceId: "svc-1", actorRole: "uploader" }),
    ).rejects.toBeInstanceOf(ServiceModerationForbiddenError);
    expect(repo.updates).toHaveLength(0);
  });

  it("throws when the service does not exist", async () => {
    const repo = new InMemoryRepo();
    await expect(
      makeUseCase(repo).execute({ serviceId: "nope", actorRole: "moderator" }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it("regenerates the token hash and returns the fresh token + author email", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved", submitterEmail: "ana@example.co", editTokenHash: "hash(old)" }));
    const result = await makeUseCase(repo).execute({ serviceId: "svc-1", actorRole: "moderator" });

    expect(result).toEqual({ email: "ana@example.co", editToken: "fresh-token" });
    // el hash viejo queda invalidado
    expect(repo.rows.get("svc-1")!.editTokenHash).toBe("hash(fresh-token)");
  });
});
