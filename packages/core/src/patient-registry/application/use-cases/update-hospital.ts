import type { Role } from "../../domain/value-objects/team-role";
import type { HospitalAdmin, HospitalChanges } from "../ports/hospital-admin";
import { InvalidTeamInputError, TeamAdminForbiddenError } from "./team-admin-errors";

// Modifica un hospital (nombre/ciudad/teléfono/activo/test). Solo el moderador global.
export class UpdateHospital {
  constructor(private readonly hospitals: HospitalAdmin) {}

  async execute(input: { actor: { role: Role }; id: string; changes: HospitalChanges }): Promise<void> {
    if (input.actor.role !== "moderator") throw new TeamAdminForbiddenError();

    const changes: HospitalChanges = { ...input.changes };
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (name === "") throw new InvalidTeamInputError("hospital name required");
      changes.name = name;
    }
    if (changes.city !== undefined) changes.city = changes.city?.trim() || null;
    if (changes.infoDeskPhone !== undefined) changes.infoDeskPhone = changes.infoDeskPhone?.trim() || null;

    await this.hospitals.update(input.id, changes);
  }
}
