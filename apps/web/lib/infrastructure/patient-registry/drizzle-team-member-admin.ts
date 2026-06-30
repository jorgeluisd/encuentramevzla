import { asc, eq, sql } from "drizzle-orm";
import { teamMembers } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import { isRole, type Role, type TeamMember, type TeamMemberAdmin } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

const COLS = {
  id: teamMembers.id,
  email: teamMembers.email,
  role: teamMembers.role,
  hospitalId: teamMembers.hospitalId,
  active: teamMembers.active,
};

function toMember(row: {
  id: string;
  email: string;
  role: string;
  hospitalId: string | null;
  active: boolean;
}): TeamMember | null {
  if (!isRole(row.role)) return null; // defensa: enum inesperado no se expone
  return { id: row.id, email: row.email, role: row.role, hospitalId: row.hospitalId, active: row.active };
}

// Gestión de la allow-list del equipo (P4). Conexión directa (service_role); solo servidor.
export class DrizzleTeamMemberAdmin implements TeamMemberAdmin {
  constructor(private readonly db: Db) {}

  async list(hospitalId: string | null): Promise<TeamMember[]> {
    const rows = await this.db
      .select(COLS)
      .from(teamMembers)
      // global (null) → todos; acotado → solo su hospital.
      .where(hospitalId === null ? undefined : eq(teamMembers.hospitalId, hospitalId))
      .orderBy(asc(teamMembers.email));
    return rows.map(toMember).filter((m): m is TeamMember => m !== null);
  }

  async findByEmail(email: string): Promise<TeamMember | null> {
    const [row] = await this.db
      .select(COLS)
      .from(teamMembers)
      .where(eq(sql`lower(${teamMembers.email})`, email.toLowerCase()))
      .limit(1);
    return row ? toMember(row) : null;
  }

  async findById(id: string): Promise<TeamMember | null> {
    const [row] = await this.db.select(COLS).from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    return row ? toMember(row) : null;
  }

  async create(input: { email: string; role: Role; hospitalId: string | null }): Promise<TeamMember> {
    const [row] = await this.db
      .insert(teamMembers)
      .values({ email: input.email, role: input.role, hospitalId: input.hospitalId })
      .returning(COLS);
    const member = row && toMember(row);
    if (!member) throw new Error("No se pudo crear el miembro.");
    return member;
  }

  async setAccess(id: string, changes: { role?: Role; active?: boolean }): Promise<void> {
    const patch: { role?: Role; active?: boolean } = {};
    if (changes.role !== undefined) patch.role = changes.role;
    if (changes.active !== undefined) patch.active = changes.active;
    if (Object.keys(patch).length === 0) return;
    await this.db.update(teamMembers).set(patch).where(eq(teamMembers.id, id));
  }
}
