import type {
  CoverageRaw,
  HospitalRowRaw,
  MetricsGranularity,
  MetricsRange,
  PatientCountsRaw,
  ProvenanceRaw,
  ReviewCountsRaw,
  SearchStatsRaw,
} from "../../domain/services/admin-metrics";

// Port de LECTURA de métricas del dashboard /admin (spec 0024). Devuelve solo AGREGADOS
// crudos (conteos/series), nunca filas de paciente ni PII. Los cálculos derivados
// (porcentajes, ranking, hit-rate, zero-fill) los hace el dominio, no el adapter.
//
// `hospitalId` acota los KPIs al centro canónico seleccionado; `null` = global.
// `hospitalBreakdown` y `searchStats` no se acotan (breakdown lista todos; búsquedas
// son globales — search_log no tiene hospital, solo hash del término).
export interface MetricsReader {
  patientCounts(hospitalId: string | null): Promise<PatientCountsRaw>;
  hospitalBreakdown(): Promise<HospitalRowRaw[]>;
  reviewCounts(hospitalId: string | null): Promise<ReviewCountsRaw>;
  coverage(hospitalId: string | null): Promise<CoverageRaw>;
  provenance(hospitalId: string | null): Promise<ProvenanceRaw>;
  searchStats(range: MetricsRange, granularity: MetricsGranularity): Promise<SearchStatsRaw>;
}
