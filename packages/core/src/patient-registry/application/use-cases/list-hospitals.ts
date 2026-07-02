import type { Role } from "../../domain/value-objects/team-role";
import type { Hospital, HospitalAdmin } from "../ports/hospital-admin";
import { TeamAdminForbiddenError } from "./team-admin-errors";

// Lista todos los hospitales para la vista de gestión. Solo el moderador global.
export class ListHospitals {
  constructor(private readonly hospitals: HospitalAdmin) {}

  async execute(input: { actor: { role: Role }; q?: string | null }): Promise<Hospital[]> {
    if (input.actor.role !== "moderator") throw new TeamAdminForbiddenError();
    return this.hospitals.list({ q: input.q?.trim() || null });
  }
}
