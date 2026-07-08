import { NormalizedPhone } from "../../../patient-registry/domain/value-objects/normalized-phone";
import { computeExpiry } from "../../domain/service-expiry";
import { ServiceCategory } from "../../domain/value-objects/service-category";
import { ServiceDescription } from "../../domain/value-objects/service-description";
import { ServiceTitle } from "../../domain/value-objects/service-title";
import type {
  ServiceChanges,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";
import { InvalidServiceInputError, ServiceNotFoundError } from "./solidarity-errors";

export interface EditServiceChanges {
  title?: string;
  category?: string;
  description?: string;
  contactPhone?: string;
}

export interface EditServiceInput {
  rawToken: string;
  changes: EditServiceChanges;
}

export class EditServiceByToken {
  constructor(
    private readonly deps: {
      repo: SolidarityServiceRepository;
      hashToken: (token: string) => string;
      now: () => Date;
    },
  ) {}

  async execute(input: EditServiceInput): Promise<void> {
    const found = await this.deps.repo.findByTokenHash(this.deps.hashToken(input.rawToken));
    if (!found) throw new ServiceNotFoundError();

    const changes: ServiceChanges = {};

    if (input.changes.title !== undefined) {
      const title = ServiceTitle.fromRaw(input.changes.title);
      if (!title.isValid) throw new InvalidServiceInputError();
      changes.title = title.value;
    }
    if (input.changes.category !== undefined) {
      const category = ServiceCategory.fromRaw(input.changes.category);
      if (!category.isValid) throw new InvalidServiceInputError();
      changes.category = category.value;
    }
    if (input.changes.description !== undefined) {
      const description = ServiceDescription.fromRaw(input.changes.description);
      if (!description.isValid) throw new InvalidServiceInputError();
      changes.description = description.value;
    }
    if (input.changes.contactPhone !== undefined) {
      const phone = NormalizedPhone.fromRaw(input.changes.contactPhone);
      if (!phone.isValid) throw new InvalidServiceInputError();
      changes.contactPhone = phone.raw.trim();
    }

    const now = this.deps.now();
    // Editar reabre la moderación (anti bait-and-switch) y renueva la vigencia.
    changes.status = "pending";
    changes.reviewedBy = null;
    changes.reviewedAt = null;
    changes.expiresAt = computeExpiry(now);
    changes.updatedAt = now;

    await this.deps.repo.updateById(found.id, changes);
  }
}
