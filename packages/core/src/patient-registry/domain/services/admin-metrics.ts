import type { PatientStatus } from "../value-objects/patient-status";

// Tipos y cálculos PUROS del dashboard de métricas (/admin/metricas, spec 0024).
// Solo AGREGADOS: conteos, porcentajes y series. Jamás filas de paciente ni PII.
// Vive en dominio (sin I/O): el adapter entrega los crudos y aquí se derivan las vistas.

export type SearchResultType =
  | "matches"
  | "no_results"
  | "requires_human_contact"
  | "invalid_term"
  | "rate_limited";

// --- Crudos que entrega el port (MetricsReader) ---

export interface PatientCountsRaw {
  total: number;
  withDocument: number;
  withoutDocument: number;
  minors: number;
  deceased: number;
  byStatus: Record<PatientStatus, number>;
}

export interface HospitalRowRaw {
  hospitalId: string;
  name: string;
  city: string | null;
  provisional: boolean;
  active: boolean;
  test: boolean;
  patients: number;
  withoutDocument: number;
  minors: number;
}

export interface ReviewCountsRaw {
  documentConflict: number;
  pendingReview: number;
}

export interface CoverageRaw {
  total: number;
  missingDocument: number;
  missingAge: number;
}

export interface SearchSeriesPoint {
  date: string; // inicio de bucket 'YYYY-MM-DD' (date_trunc)
  count: number;
}

export interface SearchStatsRaw {
  byResultType: Record<SearchResultType, number>;
  series: SearchSeriesPoint[];
}

export interface ProvenanceBatchRaw {
  ingestBatchId: string;
  kind: string;
  sourceKind: "import" | "enrich";
  patients: number;
}

export interface ProvenanceRaw {
  batches: ProvenanceBatchRaw[];
}

// Rango temporal (fechas 'YYYY-MM-DD', inclusivo) y granularidad de la serie de búsquedas.
export interface MetricsRange {
  from: string;
  to: string;
}
export type MetricsGranularity = "day" | "week";

// --- Vistas derivadas (lo que consume la página) ---

export interface CoverageMetrics extends CoverageRaw {
  missingDocumentPct: number;
  missingAgePct: number;
}

export interface HospitalBreakdown {
  total: number; // nº de hospitales canónicos
  provisionalCount: number;
  ranked: HospitalRowRaw[]; // con pacientes, desc por pacientes
  withoutPatients: HospitalRowRaw[]; // sin pacientes, alfabético
}

export interface ReviewMetrics {
  open: number;
  documentConflict: number;
  pendingReview: number;
}

export interface SearchMetrics {
  total: number;
  byResultType: Record<SearchResultType, number>;
  hitRatePct: number; // matches / total
  series: SearchSeriesPoint[]; // con zero-fill de huecos
}

export interface ProvenanceMetrics {
  imported: number;
  enriched: number;
  batches: ProvenanceBatchRaw[];
}

export interface AdminMetricsView {
  filter: { hospitalId: string | null };
  patients: PatientCountsRaw;
  hospitals: HospitalBreakdown;
  review: ReviewMetrics;
  coverage: CoverageMetrics;
  search: SearchMetrics;
  provenance: ProvenanceMetrics;
}

// Porcentaje con 1 decimal; 0 cuando el denominador es 0 (evita NaN).
export function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function computeCoverage(raw: CoverageRaw): CoverageMetrics {
  return {
    ...raw,
    missingDocumentPct: percent(raw.missingDocument, raw.total),
    missingAgePct: percent(raw.missingAge, raw.total),
  };
}

// Ranking desc por pacientes (desempate alfabético). Separa los hospitales en cero.
export function rankHospitals(rows: readonly HospitalRowRaw[]): HospitalBreakdown {
  const byName = (a: HospitalRowRaw, b: HospitalRowRaw): number =>
    a.name.localeCompare(b.name, "es");
  const ranked = rows
    .filter((h) => h.patients > 0)
    .sort((a, b) => b.patients - a.patients || byName(a, b));
  const withoutPatients = rows.filter((h) => h.patients === 0).sort(byName);
  return {
    total: rows.length,
    provisionalCount: rows.filter((h) => h.provisional).length,
    ranked,
    withoutPatients,
  };
}

export function summarizeProvenance(raw: ProvenanceRaw): ProvenanceMetrics {
  let imported = 0;
  let enriched = 0;
  for (const b of raw.batches) {
    if (b.sourceKind === "import") imported += b.patients;
    else enriched += b.patients;
  }
  return { imported, enriched, batches: raw.batches };
}

export function computeSearchMetrics(
  raw: SearchStatsRaw,
  range: MetricsRange,
  granularity: MetricsGranularity,
): SearchMetrics {
  const total = Object.values(raw.byResultType).reduce((a, b) => a + b, 0);
  return {
    total,
    byResultType: raw.byResultType,
    hitRatePct: percent(raw.byResultType.matches ?? 0, total),
    series: fillSeries(raw.series, range, granularity),
  };
}

// --- Serie temporal con zero-fill (fechas UTC 'YYYY-MM-DD') ---

function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

// Alinea a lunes (date_trunc('week') de Postgres empieza en lunes).
function snapToMonday(ms: number): number {
  const day = new Date(ms).getUTCDay(); // 0=Dom..6=Sáb
  const sinceMonday = (day + 6) % 7;
  return ms - sinceMonday * DAY_MS;
}

// Rellena los buckets faltantes entre from..to (inclusivo) con count 0.
export function fillSeries(
  series: readonly SearchSeriesPoint[],
  range: MetricsRange,
  granularity: MetricsGranularity,
): SearchSeriesPoint[] {
  const counts = new Map(series.map((p) => [p.date.slice(0, 10), p.count]));
  const step = granularity === "week" ? 7 * DAY_MS : DAY_MS;
  const start =
    granularity === "week" ? snapToMonday(parseDay(range.from)) : parseDay(range.from);
  const end =
    granularity === "week" ? snapToMonday(parseDay(range.to)) : parseDay(range.to);
  const out: SearchSeriesPoint[] = [];
  for (let cur = start; cur <= end; cur += step) {
    const key = formatDay(cur);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}
