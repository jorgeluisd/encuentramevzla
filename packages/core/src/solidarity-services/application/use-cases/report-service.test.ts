import { ReportService } from "./report-service";
import { DismissReport } from "./dismiss-report";
import { ServiceModerationForbiddenError } from "./solidarity-errors";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

const NOW = new Date("2026-08-01T00:00:00.000Z");

describe("ReportService (público)", () => {
  it("marca una publicación aprobada como reportada (idempotente, sin bajarla)", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved" }));
    await new ReportService({ repo, now: () => NOW }).execute({
      serviceId: "svc-1",
      reason: "  Es un servicio de pago  ",
    });
    const row = repo.rows.get("svc-1")!;
    expect(row.reported).toBe(true);
    expect(row.reportedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.reportReason).toBe("Es un servicio de pago"); // motivo breve, trim
    expect(row.status).toBe("approved"); // sigue pública
  });

  it("no hace nada si la publicación no existe o no está publicada", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "pending" }));
    await new ReportService({ repo, now: () => NOW }).execute({ serviceId: "svc-1" });
    await new ReportService({ repo, now: () => NOW }).execute({ serviceId: "nope" });
    expect(repo.rows.get("svc-1")!.reported).toBe(false);
  });
});

describe("DismissReport (moderador)", () => {
  it("prohíbe a no-moderadores", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved", reported: true, reportedAt: NOW }));
    await expect(
      new DismissReport({ repo, now: () => NOW }).execute({ serviceId: "svc-1", actorRole: "uploader" }),
    ).rejects.toBeInstanceOf(ServiceModerationForbiddenError);
  });

  it("limpia el flag de reporte y mantiene la publicación", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ status: "approved", reported: true, reportedAt: NOW }));
    await new DismissReport({ repo, now: () => NOW }).execute({ serviceId: "svc-1", actorRole: "moderator" });
    const row = repo.rows.get("svc-1")!;
    expect(row.reported).toBe(false);
    expect(row.reportedAt).toBeNull();
    expect(row.status).toBe("approved");
  });
});
