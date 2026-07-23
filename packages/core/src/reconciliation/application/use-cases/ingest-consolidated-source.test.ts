import type { ConsolidatedSource } from "../ports/consolidated-source-reader";
import {
  DuplicateSourceError,
  IngestConsolidatedSource,
} from "./ingest-consolidated-source";
import { counterId, FakeReader, FakeStore, rawRow, ThrowingReader } from "./_test-fakes";

const BYTES = new Uint8Array([1, 2, 3]);

function sourceWith(): ConsolidatedSource {
  return {
    sheets: [
      {
        sheetName: "Hospital Perez Carreño",
        rows: [
          rawRow("Hospital Perez Carreño", 5, {
            surname: "PEÑA",
            givenName: "JOSÉ",
            cedula: "24.140.952",
            age: "35",
            sex: "Masculino",
            registeredDateRaw: "25/06/2026",
          }),
          rawRow("Hospital Perez Carreño", 6, {
            surname: "INFANTE",
            givenName: "SIN NOMBRE",
            cedula: "INFANTE",
            age: "3",
            raw: { APELLIDO: "INFANTE", NOMBRE: "SIN NOMBRE", "CÉDULA": "INFANTE", OBS: "llegó [?]" },
          }),
          rawRow("Hospital Perez Carreño", 7, {
            surname: "",
            givenName: "",
            cedula: "-",
          }), // sin nombre → no se estagea
        ],
      },
    ],
  };
}

function makeIngest(store: FakeStore, source: ConsolidatedSource) {
  return new IngestConsolidatedSource({
    reader: new FakeReader(source),
    store,
    newId: counterId("stg"),
  });
}

describe("IngestConsolidatedSource", () => {
  it("normalizes rows and reports a summary; drops nameless rows", async () => {
    const store = new FakeStore();
    const summary = await makeIngest(store, sourceWith()).execute({
      fileBytes: BYTES,
      sourceFileName: "consolidado.xlsx",
      sourceFileHash: "hash-A",
      runId: "run-1",
    });

    expect(summary.rowsRead).toBe(3);
    expect(summary.recordsStaged).toBe(2); // la fila sin nombre se descarta
    expect(summary.withValidCedula).toBe(1);
    expect(summary.minors).toBe(1); // INFANTE + edad 3
    expect(summary.withUncertainty).toBe(1); // "[?]"
    expect(summary.datesParsed).toBe(1);

    const first = store.staging.find((r) => r.sourceRowNumber === 5)!;
    expect(first.normalizedName).toBe("pena jose");
    expect(first.normalizedDoc).toBe("24140952");
    expect(first.isDocValid).toBe(true);
    expect(first.sex).toBe("M");
    expect(first.registeredDate).toBe("2026-06-25");

    const infante = store.staging.find((r) => r.sourceRowNumber === 6)!;
    expect(infante.normalizedDoc).toBeNull();
    expect(infante.isMinor).toBe(true);
    expect(infante.hasUncertaintyMarker).toBe(true);
  });

  it("is idempotent by file hash: re-ingesting aborts unless forced", async () => {
    const store = new FakeStore();
    const ingest = makeIngest(store, sourceWith());
    await ingest.execute({ fileBytes: BYTES, sourceFileName: "c.xlsx", sourceFileHash: "hash-A", runId: "run-1" });

    await expect(
      makeIngest(store, sourceWith()).execute({
        fileBytes: BYTES,
        sourceFileName: "c.xlsx",
        sourceFileHash: "hash-A",
        runId: "run-2",
      }),
    ).rejects.toBeInstanceOf(DuplicateSourceError);

    // --force crea una corrida nueva sin ensuciar la anterior.
    const summary = await makeIngest(store, sourceWith()).execute({
      fileBytes: BYTES,
      sourceFileName: "c.xlsx",
      sourceFileHash: "hash-A",
      runId: "run-2",
      force: true,
    });
    expect(summary.runId).toBe("run-2");
    expect(store.runs.size).toBe(2);
    expect(store.staging.filter((r) => r.runId === "run-1")).toHaveLength(2);
    expect(store.staging.filter((r) => r.runId === "run-2")).toHaveLength(2);
  });

  it("fails loud (propagates) when a sheet lacks expected columns", async () => {
    const store = new FakeStore();
    const ingest = new IngestConsolidatedSource({
      reader: new ThrowingReader("Refugio Oeste", ["SEXO"]),
      store,
      newId: counterId(),
    });
    await expect(
      ingest.execute({ fileBytes: BYTES, sourceFileName: "c.xlsx", sourceFileHash: "h", runId: "r" }),
    ).rejects.toThrow(/no expone las columnas/);
    expect(store.runs.size).toBe(0); // no se ingirió nada
  });

  it("only ever writes to the reconciliation schema", async () => {
    const store = new FakeStore();
    await makeIngest(store, sourceWith()).execute({
      fileBytes: BYTES,
      sourceFileName: "c.xlsx",
      sourceFileHash: "hash-A",
      runId: "run-1",
    });
    expect(store.writeTargets.length).toBeGreaterThan(0);
    for (const target of store.writeTargets) {
      expect(target.startsWith("reconciliation.")).toBe(true);
    }
  });
});
