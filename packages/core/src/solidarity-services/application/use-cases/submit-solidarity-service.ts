import { computeExpiry } from "../../domain/service-expiry";
import { NormalizedPhone } from "../../../patient-registry/domain/value-objects/normalized-phone";
import { ServiceCategory } from "../../domain/value-objects/service-category";
import { ServiceDescription } from "../../domain/value-objects/service-description";
import { ServiceTitle } from "../../domain/value-objects/service-title";
import { SubmitterEmail } from "../../domain/value-objects/submitter-email";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import {
  InvalidServiceInputError,
  type ServiceInputField,
  TermsNotAcceptedError,
  TooManyActiveServicesError,
} from "./solidarity-errors";

const MAX_ACTIVE_PER_EMAIL = 3;

export interface SubmitServiceInput {
  title: string;
  category: string;
  description: string;
  contactPhone: string;
  submitterEmail: string;
  acceptedTerms: boolean;
}

export interface SubmitServiceResult {
  id: string;
  editToken: string;
  expiresAt: Date;
}

export interface SubmitSolidarityServiceDeps {
  repo: SolidarityServiceRepository;
  newId: () => string;
  newToken: () => string;
  hashToken: (token: string) => string;
  now: () => Date;
}

export class SubmitSolidarityService {
  constructor(private readonly deps: SubmitSolidarityServiceDeps) {}

  async execute(input: SubmitServiceInput): Promise<SubmitServiceResult> {
    const title = ServiceTitle.fromRaw(input.title);
    const category = ServiceCategory.fromRaw(input.category);
    const description = ServiceDescription.fromRaw(input.description);
    const phone = NormalizedPhone.fromRaw(input.contactPhone);
    const email = SubmitterEmail.fromRaw(input.submitterEmail);

    const invalidFields: ServiceInputField[] = [];
    if (!title.isValid) invalidFields.push("title");
    if (!category.isValid) invalidFields.push("category");
    if (!description.isValid) invalidFields.push("description");
    if (!phone.isValid) invalidFields.push("contactPhone");
    if (!email.isValid) invalidFields.push("submitterEmail");
    if (invalidFields.length > 0) throw new InvalidServiceInputError(invalidFields);

    if (!input.acceptedTerms) throw new TermsNotAcceptedError();

    const active = await this.deps.repo.countActiveByEmail(email.value);
    if (active >= MAX_ACTIVE_PER_EMAIL) throw new TooManyActiveServicesError();

    const now = this.deps.now();
    const id = this.deps.newId();
    const token = this.deps.newToken();
    const expiresAt = computeExpiry(now);

    await this.deps.repo.create({
      id,
      title: title.value,
      category: category.value,
      description: description.value,
      contactPhone: phone.raw.trim(),
      submitterEmail: email.value,
      status: "pending",
      editTokenHash: this.deps.hashToken(token),
      acceptedTermsAt: now,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return { id, editToken: token, expiresAt };
  }
}
