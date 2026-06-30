import { canManageHospitalTeam, type Role } from "../../domain/value-objects/team-role";
import type { TeamMember } from "../ports/team-member-repository";
import type { TeamMemberAdmin } from "../ports/team-member-admin";
import {
  EmailAlreadyMemberError,
  InvalidTeamInputError,
  TeamAdminForbiddenError,
} from "./team-admin-errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invita a un miembro al equipo (lo añade a la allow-list). El hospital_admin solo puede invitar
// a SU hospital y no crear moderadores globales; el moderador, a cualquiera (D5/D13).
export class InviteTeamMember {
  constructor(private readonly team: TeamMemberAdmin) {}

  async execute(input: {
    actor: { role: Role; hospitalId: string | null };
    email: string;
    role: Role;
    hospitalId: string | null;
  }): Promise<TeamMember> {
    if (!canManageHospitalTeam(input.actor.role)) throw new TeamAdminForbiddenError();

    const role = input.role;
    let hospitalId = input.hospitalId;

    if (input.actor.role === "hospital_admin") {
      // Acotado: fuerza su propio hospital y no puede crear moderadores globales.
      if (input.actor.hospitalId === null) throw new TeamAdminForbiddenError();
      if (role === "moderator") throw new TeamAdminForbiddenError();
      hospitalId = input.actor.hospitalId;
    }

    // Un rol acotado (uploader/hospital_admin) exige hospital; el moderador es global (sin hospital).
    if (role === "moderator") {
      hospitalId = null;
    } else if (!hospitalId) {
      throw new InvalidTeamInputError("hospital required for scoped role");
    }

    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new InvalidTeamInputError("invalid email");

    const existing = await this.team.findByEmail(email);
    if (existing) throw new EmailAlreadyMemberError();

    return this.team.create({ email, role, hospitalId });
  }
}
