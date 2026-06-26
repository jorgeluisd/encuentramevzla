import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabasePatientSearchGateway } from "./supabase-patient-search-gateway";

// Fake mínimo del cliente: solo necesita rpc() devolviendo { data, error }.
function fakeClient(data: unknown): SupabaseClient {
  return { rpc: async () => ({ data, error: null }) } as unknown as SupabaseClient;
}

describe("SupabasePatientSearchGateway", () => {
  it("maps paciente_nombre to patientName for adult matches", async () => {
    const client = fakeClient([
      {
        resultado: {
          hospital_nombre: "Hospital X",
          hospital_telefono_mesa: "0412-1112233",
          paciente_nombre: "perez juan",
          confianza: 0.9,
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

  it("routes minors/deceased to human-contact (no name leaked)", async () => {
    const client = fakeClient([{ resultado: { requiere_contacto_humano: true } }]);
    const result = await new SupabasePatientSearchGateway(client).search("ana");
    expect(result).toEqual({ kind: "human-contact" });
  });
});
