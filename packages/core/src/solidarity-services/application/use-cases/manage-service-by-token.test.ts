import { EditServiceByToken } from "./edit-service-by-token";
import { RemoveServiceByToken } from "./remove-service-by-token";
import { InvalidServiceInputError, ServiceNotFoundError } from "./solidarity-errors";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

const NOW = new Date("2026-08-01T00:00:00.000Z");
const hashToken = (t: string) => `hash(${t})`;

describe("EditServiceByToken", () => {
  it("throws when the token does not resolve", async () => {
    const repo = new InMemoryRepo();
    const uc = new EditServiceByToken({ repo, hashToken, now: () => NOW });
    await expect(
      uc.execute({ rawToken: "nope", changes: { title: "Nuevo título" } }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it("applies changes and sends the edit back to pending, renewing expiry", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    const uc = new EditServiceByToken({ repo, hashToken, now: () => NOW });
    await uc.execute({ rawToken: "tok-raw", changes: { title: "Inspección y peritaje" } });
    const row = repo.rows.get("svc-1")!;
    expect(row.title).toBe("Inspección y peritaje");
    expect(row.status).toBe("pending");
    expect(row.expiresAt.toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });

  it("rejects invalid changes", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    const uc = new EditServiceByToken({ repo, hashToken, now: () => NOW });
    await expect(
      uc.execute({ rawToken: "tok-raw", changes: { category: "Cripto" } }),
    ).rejects.toBeInstanceOf(InvalidServiceInputError);
  });
});

describe("RemoveServiceByToken", () => {
  it("throws when the token does not resolve", async () => {
    const repo = new InMemoryRepo();
    const uc = new RemoveServiceByToken({ repo, hashToken, now: () => NOW });
    await expect(uc.execute({ rawToken: "nope" })).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it("removes immediately", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    const uc = new RemoveServiceByToken({ repo, hashToken, now: () => NOW });
    await uc.execute({ rawToken: "tok-raw" });
    expect(repo.rows.get("svc-1")!.status).toBe("removed");
  });
});
