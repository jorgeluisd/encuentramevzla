import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { admissions, auditLog, hospitals, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type {
  PatientBrief,
  ReviewFlag,
  ReviewQueueReader,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

const DEDUP_ACTIONS = ["dedup_document_conflict", "dedup_pending_review"];

/**
 * Cola de revisión derivada del audit_log: casos `dedup_*` que aún no tienen un
 * `review_resolved`. Solo lectura, server-side (Drizzle directo).
 */
export class DrizzleReviewQueueReader implements ReviewQueueReader {
  constructor(private readonly db: Db) {}

  async listOpenFlags(): Promise<ReviewFlag[]> {
    // Subconsulta de pacientes ya resueltos: se excluyen en SQL (no cargando todo a memoria).
    const resolved = this.db
      .select({ id: auditLog.entityId })
      .from(auditLog)
      .where(and(eq(auditLog.action, "review_resolved"), isNotNull(auditLog.entityId)));

    const rows = await this.db
      .select({
        patientId: auditLog.entityId,
        name: patients.normalizedName,
        payloadDoc: sql<string | null>`${auditLog.payload}->>'document'`,
        patientDoc: patients.normalizedDocNumber,
        action: auditLog.action,
      })
      .from(auditLog)
      .innerJoin(patients, eq(patients.id, auditLog.entityId))
      .where(
        and(
          inArray(auditLog.action, DEDUP_ACTIONS),
          notInArray(auditLog.entityId, resolved),
        ),
      )
      .orderBy(asc(auditLog.createdAt));

    return rows.map((r) => ({
      patientId: r.patientId as string,
      name: r.name,
      document: r.payloadDoc ?? r.patientDoc ?? null,
      reason:
        r.action === "dedup_document_conflict"
          ? "document_conflict"
          : "pending_review",
    }));
  }

  async findByDocument(document: string): Promise<PatientBrief[]> {
    return this.briefQuery(eq(patients.normalizedDocNumber, document));
  }

  async loadBriefs(): Promise<PatientBrief[]> {
    return this.briefQuery(undefined);
  }

  private async briefQuery(
    where: ReturnType<typeof eq> | undefined,
  ): Promise<PatientBrief[]> {
    const rows = await this.db
      .select({
        id: patients.id,
        name: patients.normalizedName,
        document: patients.normalizedDocNumber,
      })
      .from(patients)
      .where(where);
    return rows.map((r) => ({ id: r.id, name: r.name, document: r.document }));
  }

  async hospitalsOf(patientIds: readonly string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (patientIds.length === 0) return map;
    const rows = await this.db
      .select({ patientId: admissions.patientId, hospital: hospitals.name })
      .from(admissions)
      .innerJoin(hospitals, eq(hospitals.id, admissions.hospitalId))
      .where(inArray(admissions.patientId, [...patientIds]));
    for (const r of rows) {
      const list = map.get(r.patientId) ?? [];
      if (!list.includes(r.hospital)) list.push(r.hospital);
      map.set(r.patientId, list);
    }
    return map;
  }

  async hospitalIdsOf(patientIds: readonly string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (patientIds.length === 0) return map;
    const rows = await this.db
      .select({ patientId: admissions.patientId, hospitalId: admissions.hospitalId })
      .from(admissions)
      .where(inArray(admissions.patientId, [...patientIds]));
    for (const r of rows) {
      const list = map.get(r.patientId) ?? [];
      if (!list.includes(r.hospitalId)) list.push(r.hospitalId);
      map.set(r.patientId, list);
    }
    return map;
  }
}
