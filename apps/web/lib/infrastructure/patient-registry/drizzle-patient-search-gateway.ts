import { sql } from "drizzle-orm";
import type { MediatedMatch, MediatedSearchResult, PatientSearchGateway } from "@evzla/core";
import type { RpcExecutor } from "../rpc-executor";
import { safeErrorTag } from "../safe-error";

export type { RpcExecutor };

interface RpcRow {
  result: {
    invalid_term?: boolean;
    rate_limited?: boolean;
    hospital_name?: string;
    info_desk_phone?: string | null;
    patient_name?: string;
    confidence?: number;
  };
}

// Búsqueda mediada: el rol `public` solo puede ejecutar el RPC SECURITY DEFINER.
export class DrizzlePatientSearchGateway implements PatientSearchGateway {
  constructor(private readonly db: RpcExecutor) {}

  // clientId: hash de la IP (anti-abuso); viaja al RPC como client_hash para el rate-limit.
  async search(term: string, clientId?: string): Promise<MediatedSearchResult> {
    let rows: RpcRow[];
    try {
      rows = (await this.db.execute(
        sql`select result from public.search_patient(${term}, ${clientId ?? null})`,
      )) as unknown as RpcRow[];
    } catch (error) {
      console.error("[search] RPC error:", safeErrorTag(error));
      return { kind: "no-results" };
    }
    const results = rows.map((r) => r.result);
    if (results.some((r) => r?.invalid_term)) return { kind: "invalid-term" };
    if (results.some((r) => r?.rate_limited)) return { kind: "rate-limited" };

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
