import type {
  AuditLogReader,
  AuditRecord,
} from "../ports/audit-log-reader";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Lista los registros más recientes del audit_log (vista de moderador). */
export class ListAuditLog {
  constructor(private readonly reader: AuditLogReader) {}

  execute(limit: number = DEFAULT_LIMIT): Promise<AuditRecord[]> {
    // Clamp defensivo: nunca menos de 1 ni más de MAX_LIMIT.
    const clamped = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
    return this.reader.listRecent(clamped);
  }
}
