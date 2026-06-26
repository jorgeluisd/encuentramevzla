import type {
  TeamMember,
  TeamMemberRepository,
} from "../ports/team-member-repository";

// Resultado de resolver la sesión contra la allow-list del equipo.
export type ResolveResult =
  | { kind: "authorized"; member: TeamMember }
  | { kind: "unauthorized" };

/**
 * Decide si el email de una sesión corresponde a un miembro ACTIVO del equipo.
 * Normaliza el email (trim + minúsculas) antes de consultar; el guard de /admin
 * usa el resultado para permitir o rechazar el acceso.
 */
export class ResolveTeamMember {
  constructor(private readonly members: TeamMemberRepository) {}

  async execute(email: string): Promise<ResolveResult> {
    const normalized = email.trim().toLowerCase();
    const member = await this.members.findByEmail(normalized);
    if (!member || !member.active) return { kind: "unauthorized" };
    return { kind: "authorized", member };
  }
}
