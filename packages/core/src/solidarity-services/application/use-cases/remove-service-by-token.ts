import type { SolidarityServiceRepository } from "../ports/solidarity-service-repository";
import { ServiceNotFoundError } from "./solidarity-errors";

export interface RemoveServiceInput {
  rawToken: string;
}

export class RemoveServiceByToken {
  constructor(
    private readonly deps: {
      repo: SolidarityServiceRepository;
      hashToken: (token: string) => string;
      now: () => Date;
    },
  ) {}

  async execute(input: RemoveServiceInput): Promise<void> {
    const found = await this.deps.repo.findByTokenHash(this.deps.hashToken(input.rawToken));
    if (!found) throw new ServiceNotFoundError();
    // Baja inmediata: el dueño retira su publicación sin pasar por moderación.
    await this.deps.repo.updateById(found.id, { status: "removed", updatedAt: this.deps.now() });
  }
}
