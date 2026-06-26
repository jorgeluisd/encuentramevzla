import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediatedMatch, MediatedSearchResult, PatientSearchGateway } from "@evzla/core";

interface RpcRow {
  result: {
    invalid_term?: boolean;
    hospital_name?: string;
    info_desk_phone?: string | null;
    patient_name?: string;
    confidence?: number;
  };
}

// Adapter de la búsqueda mediada: invoca el RPC SECURITY DEFINER con la anon key.
export class SupabasePatientSearchGateway implements PatientSearchGateway {
  constructor(private readonly client: SupabaseClient) {}

  async search(term: string): Promise<MediatedSearchResult> {
    const { data, error } = await this.client.rpc("search_patient", { term });
    if (error) {
      console.error("[search] RPC error:", error.message);
      return { kind: "no-results" };
    }
    const results = ((data as RpcRow[] | null) ?? []).map((r) => r.result);
    if (results.some((r) => r?.invalid_term)) return { kind: "invalid-term" };

    const matches: MediatedMatch[] = results
      .filter((r) => r && r.hospital_name)
      .map((r) => ({
        hospitalName: r.hospital_name as string,
        infoDeskPhone: r.info_desk_phone ?? null,
        patientName: r.patient_name ?? "",
        confidence: Number(r.confidence) || 0,
      }));
    return matches.length > 0 ? { kind: "matches", matches } : { kind: "no-results" };
  }
}
