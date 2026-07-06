import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSolidarityServiceDirectory } from "./supabase-solidarity-service-directory";

function recordingClient(data: unknown): {
  client: SupabaseClient;
  calls: { fn: string; params: unknown }[];
} {
  const calls: { fn: string; params: unknown }[] = [];
  const client = {
    rpc: async (fn: string, params: unknown) => {
      calls.push({ fn, params });
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("SupabaseSolidarityServiceDirectory", () => {
  it("maps RPC rows to PublicService (no email/token leaks) and parses created_at", async () => {
    const { client } = recordingClient([
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
    const rows = await new SupabaseSolidarityServiceDirectory(client).list({});
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
    const { client, calls } = recordingClient([]);
    await new SupabaseSolidarityServiceDirectory(client).list({ category: "Legal y notarial" });
    expect(calls).toEqual([
      { fn: "list_solidarity_services", params: { p_category: "Legal y notarial", p_q: null } },
    ]);
  });

  it("returns empty list on RPC error", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as unknown as SupabaseClient;
    const rows = await new SupabaseSolidarityServiceDirectory(client).list({ q: "x" });
    expect(rows).toEqual([]);
  });
});
