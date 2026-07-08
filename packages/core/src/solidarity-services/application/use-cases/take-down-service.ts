import { canModerate, type Role } from "../../../patient-registry/domain/value-objects/team-role";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceModerationForbiddenError } from "./solidarity-errors";

export interface TakeDownServiceInput {
  serviceId: string;
  actorRole: Role;
}

// Baja administrativa: un moderador retira una publicación del directorio (status
// "removed"). Limpia el flag de reporte. No borra el registro (trazabilidad).
export class TakeDownService {
  constructor(private readonly deps: { repo: SolidarityServiceRepository; now: () => Date }) {}

  async execute(input: TakeDownServiceInput): Promise<void> {
    if (!canModerate(input.actorRole)) throw new ServiceModerationForbiddenError();
    const now = this.deps.now();
    await this.deps.repo.updateById(input.serviceId, {
      status: "removed",
      reported: false,
      reportedAt: null,
      reportReason: null,
      updatedAt: now,
    });
  }
}
