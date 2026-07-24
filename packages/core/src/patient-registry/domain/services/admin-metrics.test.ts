import {
  computeCoverage,
  computeSearchMetrics,
  fillSeries,
  percent,
  rankHospitals,
  summarizeProvenance,
  type HospitalRowRaw,
  type SearchStatsRaw,
} from "./admin-metrics";

function hospital(over: Partial<HospitalRowRaw>): HospitalRowRaw {
  return {
    hospitalId: over.hospitalId ?? "h",
    name: over.name ?? "Hospital",
    city: over.city ?? null,
    provisional: over.provisional ?? false,
    active: over.active ?? true,
    test: over.test ?? false,
    patients: over.patients ?? 0,
    withoutDocument: over.withoutDocument ?? 0,
    minors: over.minors ?? 0,
  };
}

describe("percent", () => {
  it("redondea a 1 decimal", () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
  });
  it("devuelve 0 con denominador 0 (sin NaN)", () => {
    expect(percent(5, 0)).toBe(0);
  });
});

describe("computeCoverage", () => {
  it("calcula % sin cédula y sin edad", () => {
    const c = computeCoverage({ total: 200, missingDocument: 50, missingAge: 20 });
    expect(c.missingDocumentPct).toBe(25);
    expect(c.missingAgePct).toBe(10);
  });
});

describe("rankHospitals", () => {
  it("ordena desc por pacientes y separa los de cero", () => {
    const b = rankHospitals([
      hospital({ hospitalId: "a", name: "Alfa", patients: 5 }),
      hospital({ hospitalId: "b", name: "Beta", patients: 0 }),
      hospital({ hospitalId: "c", name: "Gamma", patients: 12, provisional: true }),
    ]);
    expect(b.total).toBe(3);
    expect(b.ranked.map((h) => h.hospitalId)).toEqual(["c", "a"]);
    expect(b.withoutPatients.map((h) => h.hospitalId)).toEqual(["b"]);
    expect(b.provisionalCount).toBe(1);
  });

  it("desempata alfabéticamente cuando hay igual nº de pacientes", () => {
    const b = rankHospitals([
      hospital({ hospitalId: "z", name: "Zeta", patients: 3 }),
      hospital({ hospitalId: "a", name: "Alfa", patients: 3 }),
    ]);
    expect(b.ranked.map((h) => h.hospitalId)).toEqual(["a", "z"]);
  });
});

describe("summarizeProvenance", () => {
  it("suma import vs enrich por lote", () => {
    const p = summarizeProvenance({
      batches: [
        { ingestBatchId: "1", kind: "reconciliation_import", sourceKind: "import", patients: 100 },
        { ingestBatchId: "2", kind: "reconciliation_enrich", sourceKind: "enrich", patients: 30 },
        { ingestBatchId: "3", kind: "reconciliation_import", sourceKind: "import", patients: 25 },
      ],
    });
    expect(p.imported).toBe(125);
    expect(p.enriched).toBe(30);
    expect(p.batches).toHaveLength(3);
  });
});

describe("fillSeries", () => {
  it("rellena días faltantes con 0 (granularidad día)", () => {
    const s = fillSeries(
      [{ date: "2026-07-20", count: 4 }, { date: "2026-07-22", count: 1 }],
      { from: "2026-07-20", to: "2026-07-22" },
      "day",
    );
    expect(s).toEqual([
      { date: "2026-07-20", count: 4 },
      { date: "2026-07-21", count: 0 },
      { date: "2026-07-22", count: 1 },
    ]);
  });

  it("alinea a lunes y rellena semanas (granularidad semana)", () => {
    // 2026-07-06, 07-13, 07-20 son lunes.
    const s = fillSeries(
      [{ date: "2026-07-06", count: 10 }, { date: "2026-07-20", count: 5 }],
      { from: "2026-07-08", to: "2026-07-21" }, // no-lunes: se snapea
      "week",
    );
    expect(s).toEqual([
      { date: "2026-07-06", count: 10 },
      { date: "2026-07-13", count: 0 },
      { date: "2026-07-20", count: 5 },
    ]);
  });
});

describe("computeSearchMetrics", () => {
  it("suma total, calcula hit-rate y hace zero-fill", () => {
    const raw: SearchStatsRaw = {
      byResultType: {
        matches: 60,
        no_results: 30,
        requires_human_contact: 5,
        invalid_term: 3,
        rate_limited: 2,
      },
      series: [{ date: "2026-07-22", count: 100 }],
    };
    const m = computeSearchMetrics(raw, { from: "2026-07-21", to: "2026-07-22" }, "day");
    expect(m.total).toBe(100);
    expect(m.hitRatePct).toBe(60);
    expect(m.series).toEqual([
      { date: "2026-07-21", count: 0 },
      { date: "2026-07-22", count: 100 },
    ]);
  });

  it("hit-rate 0 sin búsquedas (sin NaN)", () => {
    const raw: SearchStatsRaw = {
      byResultType: {
        matches: 0,
        no_results: 0,
        requires_human_contact: 0,
        invalid_term: 0,
        rate_limited: 0,
      },
      series: [],
    };
    const m = computeSearchMetrics(raw, { from: "2026-07-22", to: "2026-07-22" }, "day");
    expect(m.total).toBe(0);
    expect(m.hitRatePct).toBe(0);
    expect(m.series).toEqual([{ date: "2026-07-22", count: 0 }]);
  });
});
