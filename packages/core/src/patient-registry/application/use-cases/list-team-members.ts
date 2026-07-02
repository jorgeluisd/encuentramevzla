import type { TeamMemberAdmin, TeamMembersPage } from "../ports/team-member-admin";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Lista paginada del personal. El scoping por rol lo resuelve el caller (moderator = todos;
 * hospital_admin = su hospital). La paginación y la búsqueda por email se resuelven en SQL.
 */
export class ListTeamMembers {
  constructor(private readonly team: TeamMemberAdmin) {}

  async execute(input?: {
    scopeHospitalId?: string | null;
    q?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<TeamMembersPage> {
    const scopeHospitalId = input?.scopeHospitalId ?? null;
    const pageSize = input?.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(input?.page ?? 1));
    const q = input?.q?.trim() || null;
    return this.team.listPaged(scopeHospitalId, {
      q,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }
}
