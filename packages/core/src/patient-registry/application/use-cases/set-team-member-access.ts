import { canManageHospitalTeam, type Role } from "../../domain/value-objects/team-role";
import type { TeamMemberAdmin } from "../ports/team-member-admin";
import {
  InvalidTeamInputError,
  TeamAdminForbiddenError,
  TeamMemberNotFoundError,
} from "./team-admin-errors";

// Cambia el acceso de un miembro (rol/activo/hospital). El hospital_admin solo gestiona a su propio
// personal, no puede elevar a moderador global ni reasignar a otro hospital; el moderador, a cualquiera.
export class SetTeamMemberAccess {
  constructor(private readonly team: TeamMemberAdmin) {}

  async execute(input: {
    actor: { role: Role; hospitalId: string | null };
    memberId: string;
    changes: { role?: Role; active?: boolean; hospitalId?: string | null };
  }): Promise<void> {
    if (!canManageHospitalTeam(input.actor.role)) throw new TeamAdminForbiddenError();

    const target = await this.team.findById(input.memberId);
    if (!target) throw new TeamMemberNotFoundError();

    if (input.actor.role === "hospital_admin") {
      if (input.actor.hospitalId === null || target.hospitalId !== input.actor.hospitalId) {
        throw new TeamAdminForbiddenError();
      }
      // No puede elevar a su personal a moderador global.
      if (input.changes.role === "moderator") throw new TeamAdminForbiddenError();
      // Ni reasignar a nadie a otro hospital (solo el moderador mueve de hospital).
      if (input.changes.hospitalId !== undefined && input.changes.hospitalId !== target.hospitalId) {
        throw new TeamAdminForbiddenError();
      }
    }

    // Coherencia rol↔hospital: el moderador es global (sin hospital); el rol acotado exige hospital.
    const changes = { ...input.changes };
    const resultingRole = changes.role ?? target.role;
    if (resultingRole === "moderator") {
      changes.hospitalId = null;
    } else {
      const resultingHospitalId =
        changes.hospitalId !== undefined ? changes.hospitalId : target.hospitalId;
      if (!resultingHospitalId) throw new InvalidTeamInputError("hospital required for scoped role");
    }

    await this.team.setAccess(input.memberId, changes);
  }
}
