import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { RpcExecutor } from "../rpc-executor";
import { DrizzleSolidarityServiceDirectory } from "./drizzle-solidarity-service-directory";

const dialect = new PgDialect();

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

describe("DrizzleSolidarityServiceDirectory", () => {
  it("maps RPC rows to PublicService (no email/token leaks) and parses created_at", async () => {
    const { db } = recordingDb([
      {
        result: {
          id: "a",
          title: "Inspección",
          category: "Ingeniería y evaluación estructural",
          description: "desc",
          contact_phone: "+58 412 000 0000",
          created_at: "2026-07-05T00:00:00.000Z",
        },
      },
    ]);
    const rows = await new DrizzleSolidarityServiceDirectory(db).list({});
    expect(rows).toEqual([
      {
        id: "a",
        title: "Inspección",
        category: "Ingeniería y evaluación estructural",
        description: "desc",
        contactPhone: "+58 412 000 0000",
        createdAt: new Date("2026-07-05T00:00:00.000Z"),
      },
    ]);
  });

  it("forwards category and q filters to the RPC (null when absent)", async () => {
    const { db, calls } = recordingDb([]);
    await new DrizzleSolidarityServiceDirectory(db).list({ category: "Legal y notarial" });
    expect(calls).toEqual([
      { sql: "select result from public.list_solidarity_services($1, $2)", params: ["Legal y notarial", null] },
    ]);
  });

  it("returns empty list on DB error without logging the query text", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = {
      execute: async () => {
        throw Object.assign(new Error("Failed query ... params: plomero"), { cause: { code: "57014" } });
      },
    } as unknown as RpcExecutor;
    const rows = await new DrizzleSolidarityServiceDirectory(db).list({ q: "plomero" });
    expect(rows).toEqual([]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("plomero");
  });
});
