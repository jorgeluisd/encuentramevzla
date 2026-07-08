import { canModerate, type Role } from "../../../patient-registry/domain/value-objects/team-role";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceModerationForbiddenError } from "./solidarity-errors";

export interface DismissReportInput {
  serviceId: string;
  actorRole: Role;
}

// Descartar el reporte: el moderador considera la publicación válida; se limpia el
// flag y la publicación permanece como está (no la baja).
export class DismissReport {
  constructor(private readonly deps: { repo: SolidarityServiceRepository; now: () => Date }) {}

  async execute(input: DismissReportInput): Promise<void> {
    if (!canModerate(input.actorRole)) throw new ServiceModerationForbiddenError();
    await this.deps.repo.updateById(input.serviceId, {
      reported: false,
      reportedAt: null,
      updatedAt: this.deps.now(),
    });
  }
}
