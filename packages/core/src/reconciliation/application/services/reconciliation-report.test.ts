import {
  type ReconciliationReportData,
  renderReconciliationReport,
} from "./reconciliation-report";

function data(overrides: Partial<ReconciliationReportData> = {}): ReconciliationReportData {
  return {
    runId: "run-1",
    sourceFileName: "consolidado.xlsx",
    sourceFileHash: "abc123",
    generatedAt: "2026-07-23",
    stagingRecords: 9194,
    productionRecords: 6529,
    totals: {
      onlyInSource: 5000,
      matchIdentical: 3000,
      matchConflict: 700,
      onlyInProduction: 1255,
      dupInSource: 120,
      needsReview: 820,
    },
    byCenter: [
      { center: "Perez Carreño", hasSheet: true, onlyInSource: 100, matchIdentical: 50, matchConflict: 10, onlyInProduction: 5, dupInSource: 3 },
    ],
    centerAlignment: [
      { sheet: "Hospital Perez Carreño", resolvedHospital: "Hospital Pérez Carreño" },
      { sheet: "Golf - Playa los cocos", resolvedHospital: null },
    ],
    onlyInProduction: [
      { center: "Polideportivo La Guaira", patientName: "perez juan", createdAt: "2026-06-30" },
      { center: "Polideportivo La Guaira", patientName: "gomez ana", createdAt: null },
      { center: "Ricardo Baquero", patientName: "lopez luis", createdAt: "2026-07-01" },
    ],
    centersInProductionWithoutSheet: ["Polideportivo La Guaira", "Ricardo Baquero"],
    conflictSamples: [
      { center: "Perez Carreño", stagingName: "perez juan", productionName: "perez juan", fields: { edad: { source: 35, production: 70 } } },
    ],
    intraStagingDuplicates: [{ center: "Perez Carreño", nameA: "lopez carlos", nameB: "lopez carlos", score: 1 }],
    scoreDistribution: [{ label: "0.90–0.99", count: 42 }],
    ...overrides,
  };
}

describe("renderReconciliationReport", () => {
  it("renders all sections and the critical ONLY_IN_PRODUCTION grouping", () => {
    const md = renderReconciliationReport(data());
    expect(md).toContain("# Reporte de reconciliación — corrida run-1");
    expect(md).toContain("ONLY_IN_PRODUCTION");
    expect(md).toContain("Polideportivo La Guaira");
    // Ordenado por volumen: Polideportivo (2) antes que Ricardo Baquero (1).
    expect(md.indexOf("### Polideportivo La Guaira")).toBeLessThan(md.indexOf("### Ricardo Baquero"));
    expect(md).toContain("Centros en producción que el consolidado NO cubre");
    expect(md).toContain("edad: `35` vs `70`");
    expect(md).toContain("Distribución de similarity_score");
    expect(md).toContain("Alineación de centros");
    expect(md).toContain("**sin match**"); // Golf sin resolver
  });

  it("handles empty sections gracefully", () => {
    const md = renderReconciliationReport(
      data({ onlyInProduction: [], centersInProductionWithoutSheet: [], conflictSamples: [], intraStagingDuplicates: [] }),
    );
    expect(md).toContain("No hay registros solo en producción");
    expect(md).toContain("Sin conflictos");
    expect(md).toContain("Sin duplicados intra-staging");
  });
});
