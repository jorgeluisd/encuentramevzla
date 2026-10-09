import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { DrizzlePatientSearchGateway, type RpcExecutor } from "./drizzle-patient-search-gateway";

const dialect = new PgDialect();

// Fake del ejecutor: captura el SQL renderizado (texto + params) y devuelve filas fijas.
function recordingDb(rows: unknown[]): { db: RpcExecutor; calls: { sql: string; params: unknown[] }[] } {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: async (query: SQL) => {
      const { sql, params } = dialect.sqlToQuery(query);
      calls.push({ sql, params });
      return rows;
    },
  } as unknown as RpcExecutor;
  return { db, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("DrizzlePatientSearchGateway", () => {
  it("maps patient_name to patientName for adult matches", async () => {
    const { db } = recordingDb([
      {
        result: {
          hospital_name: "Hospital X",
          info_desk_phone: "0412-1112233",
          patient_name: "perez juan",
          confidence: 0.9,
        },
      },
    ]);
    const result = await new DrizzlePatientSearchGateway(db).search("juan perez");
    expect(result).toEqual({
      kind: "matches",
      matches: [
        {
          hospitalName: "Hospital X",
          infoDeskPhone: "0412-1112233",
          patientName: "perez juan",
          confidence: 0.9,
        },
      ],
    });
  });

  // ADR-0003: el gate humano fue retirado; el RPC devuelve la ubicación en todos los casos.
  it("maps any match (including minors/deceased) to matches with hospital", async () => {
    const { db } = recordingDb([
      {
        result: {
          hospital_name: "Hospital Y",
          info_desk_phone: null,
          patient_name: "ana gomez",
          confidence: 0.8,
        },
      },
    ]);
    const result = await new DrizzlePatientSearchGateway(db).search("ana gomez");
    expect(result).toEqual({
      kind: "matches",
      matches: [
        { hospitalName: "Hospital Y", infoDeskPhone: null, patientName: "ana gomez", confidence: 0.8 },
      ],
    });
  });

  it("calls only the mediated RPC with term and client hash as bound params", async () => {
    const { db, calls } = recordingDb([]);
    await new DrizzlePatientSearchGateway(db).search("juan perez", "ip-hash-abc");
    expect(calls).toEqual([
      { sql: "select result from public.search_patient($1, $2)", params: ["juan perez", "ip-hash-abc"] },
    ]);
  });

  it("sends a null client hash when absent", async () => {
    const { db, calls } = recordingDb([]);
    await new DrizzlePatientSearchGateway(db).search("juan perez");
    expect(calls[0]?.params).toEqual(["juan perez", null]);
  });

  it("maps the rate_limited result to kind rate-limited", async () => {
    const { db } = recordingDb([{ result: { rate_limited: true } }]);
    const result = await new DrizzlePatientSearchGateway(db).search("juan perez", "ip-hash-abc");
    expect(result).toEqual({ kind: "rate-limited" });
  });

  it("maps the invalid_term result to kind invalid-term", async () => {
    const { db } = recordingDb([{ result: { invalid_term: true } }]);
    const result = await new DrizzlePatientSearchGateway(db).search("x");
    expect(result).toEqual({ kind: "invalid-term" });
  });

  it("returns no-results on DB error and never logs the search term", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = {
      execute: async () => {
        throw Object.assign(new Error("Failed query: ... params: juan perez"), {
          cause: { code: "42501" },
        });
      },
    } as unknown as RpcExecutor;
    const result = await new DrizzlePatientSearchGateway(db).search("juan perez");
    expect(result).toEqual({ kind: "no-results" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("juan perez");
    expect(JSON.stringify(spy.mock.calls)).toContain("42501");
  });
});
