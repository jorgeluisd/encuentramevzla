import type { ReconciliationReportData } from "../services/reconciliation-report";

// Puerto de lectura para armar el reporte: el adapter agrega con SQL (SOLO lectura).
export interface ReportReadModel {
  buildReportData(runId: string): Promise<ReconciliationReportData>;
}
