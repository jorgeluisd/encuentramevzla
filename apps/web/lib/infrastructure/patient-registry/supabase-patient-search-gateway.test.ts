import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabasePatientSearchGateway } from "./supabase-patient-search-gateway";

// Fake mínimo del cliente: solo necesita rpc() devolviendo { data, error }.
function fakeClient(data: unknown): SupabaseClient {
  return { rpc: async () => ({ data, error: null }) } as unknown as SupabaseClient;
}

describe("SupabasePatientSearchGateway", () => {
  it("maps patient_name to patientName for adult matches", async () => {
    const client = fakeClient([
      {
        result: {
          hospital_name: "Hospital X",
          info_desk_phone: "0412-1112233",
          patient_name: "perez juan",
          confidence: 0.9,
        },
      },
    ]);
    const result = await new SupabasePatientSearchGateway(client).search("juan perez");
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
    const client = fakeClient([
      {
        result: {
          hospital_name: "Hospital Y",
          info_desk_phone: null,
          patient_name: "ana gomez",
          confidence: 0.8,
        },
      },
    ]);
    const result = await new SupabasePatientSearchGateway(client).search("ana gomez");
    expect(result).toEqual({
      kind: "matches",
      matches: [
        {
          hospitalName: "Hospital Y",
          infoDeskPhone: null,
          patientName: "ana gomez",
          confidence: 0.8,
        },
      ],
    });
  });
});
