import { canModerate, type Role } from "../../../patient-registry/domain/value-objects/team-role";
import { computeExpiry } from "../../domain/service-expiry";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceModerationForbiddenError } from "./solidarity-errors";

export interface ApproveServiceInput {
  serviceId: string;
  actorRole: Role;
  reviewerId: string;
}

export class ApproveService {
  constructor(
    private readonly deps: { repo: SolidarityServiceRepository; now: () => Date },
  ) {}

  async execute(input: ApproveServiceInput): Promise<void> {
    if (!canModerate(input.actorRole)) throw new ServiceModerationForbiddenError();
    const now = this.deps.now();
    // Aprobar renueva la vigencia: los 90 días cuentan desde la aprobación, no desde el alta.
    await this.deps.repo.updateById(input.serviceId, {
      status: "approved",
      reviewedBy: input.reviewerId,
      reviewedAt: now,
      rejectionReason: null,
      expiresAt: computeExpiry(now),
      updatedAt: now,
    });
  }
}
