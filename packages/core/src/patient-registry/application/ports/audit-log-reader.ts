// Registro del audit_log listo para mostrar (con el email del actor resuelto).
export interface AuditRecord {
  id: string;
  action: string;
  entity: string;
  actorEmail: string | null;
  createdAt: Date;
}

// Port de LECTURA del audit_log (separado de AuditLog, que solo escribe).
export interface AuditLogReader {
  listRecent(limit: number): Promise<AuditRecord[]>;
}
