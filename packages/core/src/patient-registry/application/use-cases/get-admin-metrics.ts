import {
  computeCoverage,
  computeSearchMetrics,
  rankHospitals,
  summarizeProvenance,
  type AdminMetricsView,
  type MetricsGranularity,
  type MetricsRange,
} from "../../domain/services/admin-metrics";
import type { MetricsReader } from "../ports/metrics-reader";

export interface GetAdminMetricsInput {
  hospitalId?: string | null;
  range: MetricsRange;
  granularity: MetricsGranularity;
}

/**
 * Compone la vista del dashboard /admin/metricas (spec 0024). Lee agregados crudos del
 * port (en paralelo) y aplica los cálculos puros del dominio. Solo AGREGADOS: nunca
 * expone filas de paciente ni datos sensibles.
 */
export class GetAdminMetrics {
  constructor(private readonly reader: MetricsReader) {}

  async execute(input: GetAdminMetricsInput): Promise<AdminMetricsView> {
    const hospitalId = input.hospitalId ?? null;
    // En SERIE, no en paralelo: 6 queries concurrentes saturaban el pooler de Supabase
    // en serverless (statement_timeout / cuelgue de la función). Co-ubicadas con la DB
    // el costo secuencial es mínimo. Ver memoria del bug de /admin/metricas en prod.
    const patients = await this.reader.patientCounts(hospitalId);
    const hospitalRows = await this.reader.hospitalBreakdown();
    const review = await this.reader.reviewCounts(hospitalId);
    const coverage = await this.reader.coverage(hospitalId);
    const provenance = await this.reader.provenance(hospitalId);
    const search = await this.reader.searchStats(input.range, input.granularity);

    return {
      filter: { hospitalId },
      patients,
      hospitals: rankHospitals(hospitalRows),
      review: {
        open: review.documentConflict + review.pendingReview,
        documentConflict: review.documentConflict,
        pendingReview: review.pendingReview,
      },
      coverage: computeCoverage(coverage),
      provenance: summarizeProvenance(provenance),
      search: computeSearchMetrics(search, input.range, input.granularity),
    };
  }
}
