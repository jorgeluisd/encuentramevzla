import { and, asc, eq, sql } from "drizzle-orm";
import { auditLog, rawRows } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { ForeignRow, ForeignRowsReader, ParsedPatientRow } from "@evzla/core";
import { mapColumns, mapRow, type RawRow } from "./excel-parsing";

type Db = ReturnType<typeof getDb>;

/**
 * Bandeja de filas segregadas (ADR-0006): audits `ingest_foreign_hospital_row` que aún no
 * tienen un `foreign_row_resolved` para el mismo fingerprint. Solo lectura, server-side.
 */
export class DrizzleForeignRowsReader implements ForeignRowsReader {
  constructor(private readonly db: Db) {}

  async listOpen(): Promise<ForeignRow[]> {
    const rows = await this.db
      .select({
        fingerprint: sql<string>`${auditLog.payload}->>'fingerprint'`,
        hospitalName: sql<string>`${auditLog.payload}->>'hospitalName'`,
        raw: rawRows.rawRow,
      })
      .from(auditLog)
      .leftJoin(rawRows, eq(rawRows.contentHash, sql`${auditLog.payload}->>'fingerprint'`))
      .where(
        and(
          eq(auditLog.action, "ingest_foreign_hospital_row"),
          sql`${auditLog.payload}->>'fingerprint' NOT IN (
            SELECT payload->>'fingerprint' FROM public.audit_log WHERE action = 'foreign_row_resolved'
          )`,
        ),
      )
      .orderBy(asc(auditLog.createdAt));

    return rows.map((r) => {
      const raw = (r.raw ?? {}) as RawRow;
      const mapped = mapRow(raw, mapColumns(Object.keys(raw)));
      return { fingerprint: r.fingerprint, hospitalName: r.hospitalName, fullName: mapped.fullName };
    });
  }

  async loadParsedRow(fingerprint: string): Promise<ParsedPatientRow | null> {
    const [r] = await this.db
      .select({ raw: rawRows.rawRow })
      .from(rawRows)
      .where(eq(rawRows.contentHash, fingerprint))
      .limit(1);
    if (!r) return null;
    const raw = (r.raw ?? {}) as RawRow;
    const mapped = mapRow(raw, mapColumns(Object.keys(raw)));
    return {
      fingerprint,
      raw,
      hospitalName: null, // el destino se fuerza en la reasignación (no re-segregar)
      fullName: mapped.fullName,
      age: mapped.age,
      documentNumber: mapped.documentNumber,
      phone: mapped.phone,
      address: mapped.address,
      clinicalNotes: mapped.clinicalNotes,
    };
  }
}
