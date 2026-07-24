import { GetAdminMetrics } from "./get-admin-metrics";
import type { MetricsReader } from "../ports/metrics-reader";
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

class FakeReader implements MetricsReader {
  public lastPatientScope: string | null | undefined;
  public lastSearchArgs: { range: MetricsRange; granularity: MetricsGranularity } | undefined;

  constructor(
    private readonly data: {
      patients: PatientCountsRaw;
      hospitals: HospitalRowRaw[];
      review: ReviewCountsRaw;
      coverage: CoverageRaw;
      provenance: ProvenanceRaw;
      search: SearchStatsRaw;
    },
  ) {}

  async patientCounts(hospitalId: string | null): Promise<PatientCountsRaw> {
    this.lastPatientScope = hospitalId;
    return this.data.patients;
  }
  async hospitalBreakdown(): Promise<HospitalRowRaw[]> {
    return this.data.hospitals;
  }
  async reviewCounts(): Promise<ReviewCountsRaw> {
    return this.data.review;
  }
  async coverage(): Promise<CoverageRaw> {
    return this.data.coverage;
  }
  async provenance(): Promise<ProvenanceRaw> {
    return this.data.provenance;
  }
  async searchStats(
    range: MetricsRange,
    granularity: MetricsGranularity,
  ): Promise<SearchStatsRaw> {
    this.lastSearchArgs = { range, granularity };
    return this.data.search;
  }
}

function fixture(): ConstructorParameters<typeof FakeReader>[0] {
  return {
    patients: {
      total: 100,
      withDocument: 70,
      withoutDocument: 30,
      minors: 12,
      deceased: 4,
      byStatus: { admitted: 80, transferred: 5, discharged: 6, located: 5, deceased: 4 },
    },
    hospitals: [
      {
        hospitalId: "h1",
        name: "Hospital Uno",
        city: "Caracas",
        provisional: false,
        active: true,
        test: false,
        patients: 60,
        withoutDocument: 20,
        minors: 8,
      },
      {
        hospitalId: "h2",
        name: "Hospital Dos",
        city: null,
        provisional: true,
        active: true,
        test: false,
        patients: 0,
        withoutDocument: 0,
        minors: 0,
      },
    ],
    review: { documentConflict: 7, pendingReview: 3 },
    coverage: { total: 100, missingDocument: 30, missingAge: 15 },
    provenance: {
      batches: [
        { ingestBatchId: "b1", kind: "reconciliation_import", sourceKind: "import", patients: 50 },
        { ingestBatchId: "b2", kind: "reconciliation_enrich", sourceKind: "enrich", patients: 12 },
      ],
    },
    search: {
      byResultType: {
        matches: 40,
        no_results: 8,
        requires_human_contact: 1,
        invalid_term: 1,
        rate_limited: 0,
      },
      series: [{ date: "2026-07-22", count: 50 }],
    },
  };
}

const range: MetricsRange = { from: "2026-07-21", to: "2026-07-22" };

describe("GetAdminMetrics", () => {
  it("compone la vista completa con derivados (coverage, ranking, review.open, provenance, search)", async () => {
    const reader = new FakeReader(fixture());
    const view = await new GetAdminMetrics(reader).execute({ range, granularity: "day" });

    expect(view.patients.total).toBe(100);
    expect(view.coverage.missingDocumentPct).toBe(30);
    expect(view.coverage.missingAgePct).toBe(15);
    expect(view.hospitals.ranked.map((h) => h.hospitalId)).toEqual(["h1"]);
    expect(view.hospitals.withoutPatients.map((h) => h.hospitalId)).toEqual(["h2"]);
    expect(view.hospitals.provisionalCount).toBe(1);
    expect(view.review).toEqual({ open: 10, documentConflict: 7, pendingReview: 3 });
    expect(view.provenance.imported).toBe(50);
    expect(view.provenance.enriched).toBe(12);
    expect(view.search.total).toBe(50);
    expect(view.search.hitRatePct).toBe(80);
    expect(view.search.series).toEqual([
      { date: "2026-07-21", count: 0 },
      { date: "2026-07-22", count: 50 },
    ]);
  });

  it("propaga el filtro de hospital al port y lo refleja en la vista", async () => {
    const reader = new FakeReader(fixture());
    const view = await new GetAdminMetrics(reader).execute({
      hospitalId: "h1",
      range,
      granularity: "week",
    });
    expect(reader.lastPatientScope).toBe("h1");
    expect(view.filter.hospitalId).toBe("h1");
    expect(reader.lastSearchArgs).toEqual({ range, granularity: "week" });
  });

  it("hospitalId ausente => scope global (null)", async () => {
    const reader = new FakeReader(fixture());
    const view = await new GetAdminMetrics(reader).execute({ range, granularity: "day" });
    expect(reader.lastPatientScope).toBeNull();
    expect(view.filter.hospitalId).toBeNull();
  });
});
