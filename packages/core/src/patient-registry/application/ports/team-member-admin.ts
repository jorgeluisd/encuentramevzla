import type { Role } from "../../domain/value-objects/team-role";
import type { TeamMember } from "./team-member-repository";

// Página de personal: la ventana pedida + el total (para calcular cuántas páginas hay).
export interface TeamMembersPage {
  members: TeamMember[];
  total: number;
}

// Port de gestión del equipo (allow-list del portal). Escritura server-side; nunca cliente.
export interface TeamMemberAdmin {
  // Lista miembros; `hospitalId` acota al hospital (hospital_admin) y `null` trae todos (global).
  list(hospitalId: string | null): Promise<TeamMember[]>;
  // Igual que `list` pero paginado y con búsqueda opcional por email (`q`, ILIKE).
  listPaged(
    hospitalId: string | null,
    options: { q?: string | null; limit: number; offset: number },
  ): Promise<TeamMembersPage>;
  findByEmail(email: string): Promise<TeamMember | null>;
  findById(id: string): Promise<TeamMember | null>;
  create(input: { email: string; role: Role; hospitalId: string | null }): Promise<TeamMember>;
  setAccess(
    id: string,
    changes: { role?: Role; active?: boolean; hospitalId?: string | null },
  ): Promise<void>;
}
