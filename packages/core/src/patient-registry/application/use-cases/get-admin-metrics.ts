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
    const [patients, hospitalRows, review, coverage, provenance, search] = await Promise.all([
      this.reader.patientCounts(hospitalId),
      this.reader.hospitalBreakdown(),
      this.reader.reviewCounts(hospitalId),
      this.reader.coverage(hospitalId),
      this.reader.provenance(hospitalId),
      this.reader.searchStats(input.range, input.granularity),
    ]);

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
