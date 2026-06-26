import { eq, sql } from "drizzle-orm";
import { teamMembers } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import {
  isRole,
  type TeamMember,
  type TeamMemberRepository,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Adapter de la allow-list del equipo sobre `public.team_members` (Drizzle).
 * Se ejecuta SOLO en servidor (la conexión directa salta RLS, igual que la ingesta).
 * Compara el email en minúsculas.
 */
export class DrizzleTeamMemberRepository implements TeamMemberRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<TeamMember | null> {
    const [row] = await this.db
      .select({
        id: teamMembers.id,
        email: teamMembers.email,
        role: teamMembers.role,
        hospitalId: teamMembers.hospitalId,
        active: teamMembers.active,
      })
      .from(teamMembers)
      .where(eq(sql`lower(${teamMembers.email})`, email.toLowerCase()))
      .limit(1);

    // Defensa: si el enum de la DB trajera algo inesperado, no autorizamos.
    if (!row || !isRole(row.role)) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      hospitalId: row.hospitalId,
      active: row.active,
    };
  }
}
