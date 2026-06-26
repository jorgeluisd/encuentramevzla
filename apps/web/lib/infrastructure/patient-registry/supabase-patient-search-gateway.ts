import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediatedMatch, MediatedSearchResult, PatientSearchGateway } from "@evzla/core";

interface RpcRow {
  resultado: {
    termino_invalido?: boolean;
    requiere_contacto_humano?: boolean;
    hospital_nombre?: string;
    hospital_telefono_mesa?: string | null;
    confianza?: number;
  };
}

// Adapter de la búsqueda mediada: invoca el RPC SECURITY DEFINER con la anon key.
export class SupabasePatientSearchGateway implements PatientSearchGateway {
  constructor(private readonly client: SupabaseClient) {}

  async search(term: string): Promise<MediatedSearchResult> {
    const { data, error } = await this.client.rpc("buscar_paciente", { termino: term });
    if (error) {
      console.error("[buscar] error RPC:", error.message);
      return { kind: "no-results" };
    }
    const results = ((data as RpcRow[] | null) ?? []).map((r) => r.resultado);
    if (results.some((r) => r?.termino_invalido)) return { kind: "invalid-term" };
    if (results.some((r) => r?.requiere_contacto_humano)) return { kind: "human-contact" };

    const matches: MediatedMatch[] = results
      .filter((r) => r && r.hospital_nombre)
      .map((r) => ({
        hospitalName: r.hospital_nombre as string,
        infoDeskPhone: r.hospital_telefono_mesa ?? null,
        confidence: Number(r.confianza) || 0,
      }));
    return matches.length > 0 ? { kind: "matches", matches } : { kind: "no-results" };
  }
}
