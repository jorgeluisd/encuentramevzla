import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";

const MAX_REASON = 200;

export interface ReportServiceInput {
  serviceId: string;
  reason?: string;
}

// Reporte público (sin sesión): marca una publicación PUBLICADA como reportada.
// Es un flag idempotente — no baja la publicación; solo la envía a revisión con
// etiqueta. La protección anti-bot vive en la Server Action (Turnstile).
export class ReportService {
  constructor(private readonly deps: { repo: SolidarityServiceRepository; now: () => Date }) {}

  async execute(input: ReportServiceInput): Promise<void> {
    const record = await this.deps.repo.findById(input.serviceId);
    // Solo se reportan publicaciones visibles al público.
    if (!record || record.status !== "approved") return;
    const reason = input.reason?.trim().slice(0, MAX_REASON) || null;
    await this.deps.repo.updateById(input.serviceId, {
      reported: true,
      reportedAt: this.deps.now(),
      reportReason: reason,
      updatedAt: this.deps.now(),
    });
  }
}
