import type { Role } from "../../domain/value-objects/team-role";
import type { CreatedHospital, HospitalAdmin } from "../ports/hospital-admin";
import { InvalidTeamInputError, TeamAdminForbiddenError } from "./team-admin-errors";

// Alta de hospital (D13). Solo el moderador global crea hospitales; el hospital_admin no.
export class CreateHospital {
  constructor(private readonly hospitals: HospitalAdmin) {}

  async execute(input: {
    actor: { role: Role };
    name: string;
    city?: string | null;
    infoDeskPhone?: string | null;
  }): Promise<CreatedHospital> {
    if (input.actor.role !== "moderator") throw new TeamAdminForbiddenError();
    const name = input.name.trim();
    if (name === "") throw new InvalidTeamInputError("hospital name required");
    return this.hospitals.create({
      name,
      city: input.city?.trim() || null,
      infoDeskPhone: input.infoDeskPhone?.trim() || null,
    });
  }
}
