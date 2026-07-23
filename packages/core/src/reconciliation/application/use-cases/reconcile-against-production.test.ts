import type {
  ProductionCandidateRow,
  ProductionPatientRow,
  StagingRecordInput,
} from "../ports/reconciliation-store";
import { ReconcileAgainstProduction } from "./reconcile-against-production";
import { counterId, FakeProduction, FakeStore } from "./_test-fakes";

const CENTER = "Hospital Perez Carreño";

function staged(
  runId: string,
  id: string,
  name: string,
  doc: string | null,
  age: number | null,
  sex: string | null,
): StagingRecordInput {
  return {
    id,
    runId,
    sheetName: CENTER,
    sourceRowNumber: 1,
    raw: {},
    normalizedName: name,
    nameTokens: name.split(" "),
    normalizedDoc: doc,
    isDocValid: doc != null,
    age,
    sex,
    isMinor: false,
    hasUncertaintyMarker: false,
    registeredDateRaw: null,
    registeredDate: null,
    centerFromSheet: CENTER,
    centerFromColumn: null,
    centerMismatch: false,
  };
}

function candidate(
  id: string,
  name: string,
  doc: string | null,
  age: number | null,
  sex: string | null,
): ProductionCandidateRow {
  return { id, normalizedName: name, normalizedDoc: doc, age, sex, centerCanonical: CENTER };
}
function patient(id: string, name: string): ProductionPatientRow {
  return { id, normalizedName: name, centerCanonical: CENTER, centerName: CENTER, createdAt: null };
}

function seed(store: FakeStore, runId: string) {
  store.staging.push(
    staged(runId, `${runId}-s1`, "pena jose", "24140952", 35, "M"), // = p1 → IDENTICAL
    staged(runId, `${runId}-s2`, "rodriguez maria", "11223344", 30, "F"), // p2 edad distinta → CONFLICT
    staged(runId, `${runId}-s3`, "lopez carlos", null, 50, "M"), // sin candidato → ONLY_IN_SOURCE
    staged(runId, `${runId}-s4`, "lopez carlos", null, 50, "M"), // dup de s3 → ONLY_IN_SOURCE + DUP
  );
}

function production() {
  const candidatesByCenter = new Map<string, ProductionCandidateRow[]>([
    [
      CENTER,
      [
        candidate("p1", "pena jose", "24140952", 35, "M"),
        candidate("p2", "rodriguez maria", "11223344", 70, "F"),
        candidate("p3", "gonzalez pedro", "99887766", 40, "M"), // nadie lo matchea → ONLY_IN_PRODUCTION
      ],
    ],
  ]);
  const all = [patient("p1", "pena jose"), patient("p2", "rodriguez maria"), patient("p3", "gonzalez pedro")];
  return new FakeProduction(candidatesByCenter, all);
}

describe("ReconcileAgainstProduction", () => {
  it("classifies the four categories plus intra-staging duplicates", async () => {
    const store = new FakeStore();
    seed(store, "run-1");
    const summary = await new ReconcileAgainstProduction({
      store,
      production: production(),
      newId: counterId("m"),
    }).execute({ runId: "run-1" });

    expect(summary.matchIdentical).toBe(1);
    expect(summary.matchConflict).toBe(1);
    expect(summary.onlyInSource).toBe(2);
    expect(summary.dupInSource).toBe(1);
    expect(summary.onlyInProduction).toBe(1);
    expect(summary.needsReview).toBe(2); // conflicto + duplicado

    const onlyProd = store.matches.filter((m) => m.category === "ONLY_IN_PRODUCTION");
    expect(onlyProd).toHaveLength(1);
    expect(onlyProd[0]!.productionRecordId).toBe("p3");

    const dup = store.matches.find((m) => m.category === "DUP_IN_SOURCE")!;
    expect(dup.stagingRecordId).toBe("run-1-s4");
    expect(dup.relatedStagingRecordId).toBe("run-1-s3");
  });

  it("running twice under different run_ids is idempotent and isolated", async () => {
    const store = new FakeStore();
    seed(store, "run-1");
    seed(store, "run-2");
    const deps = { store, production: production(), newId: counterId("m") };

    const s1 = await new ReconcileAgainstProduction(deps).execute({ runId: "run-1" });
    const s2 = await new ReconcileAgainstProduction(deps).execute({ runId: "run-2" });

    // Mismos totales por categoría (salvo el runId).
    expect({ ...s1, runId: "x" }).toEqual({ ...s2, runId: "x" });
    // Cada corrida guarda sus propios matches, sin contaminar la otra.
    expect(store.matches.filter((m) => m.runId === "run-1").length).toBe(
      store.matches.filter((m) => m.runId === "run-2").length,
    );
    expect(store.matches.some((m) => m.runId === "run-1")).toBe(true);
    expect(store.matches.some((m) => m.runId === "run-2")).toBe(true);
  });

  it("never writes outside the reconciliation schema; production access is read-only", async () => {
    const store = new FakeStore();
    seed(store, "run-1");
    const prod = production();
    await new ReconcileAgainstProduction({ store, production: prod, newId: counterId("m") }).execute({
      runId: "run-1",
    });
    for (const target of store.writeTargets) {
      expect(target.startsWith("reconciliation.")).toBe(true);
    }
    // El puerto de producción solo expone lecturas (no hay método de escritura que llamar).
    expect(prod.reads.every((r) => r.startsWith("read"))).toBe(true);
  });
});
