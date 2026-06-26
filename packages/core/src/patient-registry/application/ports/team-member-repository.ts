import type { Role } from "../../domain/value-objects/team-role";

// Miembro del equipo verificado (allow-list del portal /admin).
export interface TeamMember {
  id: string;
  email: string;
  role: Role;
  hospitalId: string | null;
  active: boolean;
}

// Port: lo implementa la infraestructura (Drizzle sobre `team_members`).
export interface TeamMemberRepository {
  findByEmail(email: string): Promise<TeamMember | null>;
}
