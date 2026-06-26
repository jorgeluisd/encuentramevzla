import { desc, eq } from "drizzle-orm";
import { auditLog, teamMembers } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { AuditLogReader, AuditRecord } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Lectura del audit_log para la vista de moderador. Resuelve el email del actor
 * con un LEFT JOIN a team_members. Solo servidor (Drizzle directo).
 */
export class DrizzleAuditLogReader implements AuditLogReader {
  constructor(private readonly db: Db) {}

  async listRecent(limit: number): Promise<AuditRecord[]> {
    const rows = await this.db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        actorEmail: teamMembers.email,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(teamMembers, eq(auditLog.actorId, teamMembers.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      actorEmail: r.actorEmail ?? null,
      createdAt: r.createdAt,
    }));
  }
}
