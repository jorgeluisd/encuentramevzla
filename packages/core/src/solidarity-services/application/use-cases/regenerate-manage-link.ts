import { canModerate, type Role } from "../../../patient-registry/domain/value-objects/team-role";
import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceModerationForbiddenError, ServiceNotFoundError } from "./solidarity-errors";

export interface RegenerateManageLinkInput {
  serviceId: string;
  actorRole: Role;
}

export interface RegenerateManageLinkResult {
  email: string;
  editToken: string;
}

// Reenvío del enlace de gestión: como solo guardamos el HASH del token, no se puede
// recuperar el enlace original. Se genera uno nuevo (invalida el anterior, como un
// "restablecer") y se devuelve para que la capa web lo envíe por correo al autor.
export class RegenerateManageLink {
  constructor(
    private readonly deps: {
      repo: SolidarityServiceRepository;
      newToken: () => string;
      hashToken: (token: string) => string;
      now: () => Date;
    },
  ) {}

  async execute(input: RegenerateManageLinkInput): Promise<RegenerateManageLinkResult> {
    if (!canModerate(input.actorRole)) throw new ServiceModerationForbiddenError();
    const record = await this.deps.repo.findById(input.serviceId);
    if (!record) throw new ServiceNotFoundError();

    const token = this.deps.newToken();
    await this.deps.repo.updateById(input.serviceId, {
      editTokenHash: this.deps.hashToken(token),
      updatedAt: this.deps.now(),
    });

    return { email: record.submitterEmail, editToken: token };
  }
}
