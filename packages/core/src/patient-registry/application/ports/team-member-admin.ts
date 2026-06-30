import type { Role } from "../../domain/value-objects/team-role";
import type { TeamMember } from "./team-member-repository";

// Port de gestión del equipo (allow-list del portal). Escritura server-side; nunca cliente.
export interface TeamMemberAdmin {
  // Lista miembros; `hospitalId` acota al hospital (hospital_admin) y `null` trae todos (global).
  list(hospitalId: string | null): Promise<TeamMember[]>;
  findByEmail(email: string): Promise<TeamMember | null>;
  findById(id: string): Promise<TeamMember | null>;
  create(input: { email: string; role: Role; hospitalId: string | null }): Promise<TeamMember>;
  setAccess(id: string, changes: { role?: Role; active?: boolean }): Promise<void>;
}
