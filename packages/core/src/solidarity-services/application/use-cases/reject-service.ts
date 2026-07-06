import { canModerate, type Role } from "../../../patient-registry/domain/value-objects/team-role";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceModerationForbiddenError } from "./solidarity-errors";

export interface RejectServiceInput {
  serviceId: string;
  actorRole: Role;
  reviewerId: string;
  reason: string;
}

export class RejectService {
  constructor(
    private readonly deps: { repo: SolidarityServiceRepository; now: () => Date },
  ) {}

  async execute(input: RejectServiceInput): Promise<void> {
    if (!canModerate(input.actorRole)) throw new ServiceModerationForbiddenError();
    const now = this.deps.now();
    await this.deps.repo.updateById(input.serviceId, {
      status: "rejected",
      rejectionReason: input.reason,
      reviewedBy: input.reviewerId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
}
