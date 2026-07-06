import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListPublishedInput, PublicService, SolidarityServiceDirectory } from "@evzla/core";

interface RpcRow {
  result: {
    id: string;
    title: string;
    category: string;
    description: string;
    contact_phone: string;
    created_at: string;
  };
}

// Adapter de lectura pública mediada: invoca el RPC SECURITY DEFINER con la anon key.
// El RPC ya filtra a `approved` + vigentes y NO devuelve email ni token.
export class SupabaseSolidarityServiceDirectory implements SolidarityServiceDirectory {
  constructor(private readonly client: SupabaseClient) {}

  async list(input: ListPublishedInput): Promise<PublicService[]> {
    const { data, error } = await this.client.rpc("list_solidarity_services", {
      p_category: input.category ?? null,
      p_q: input.q ?? null,
    });
    if (error) {
      console.error("[solidarity] RPC error:", error.message);
      return [];
    }
    return ((data as RpcRow[] | null) ?? []).map((r) => ({
      id: r.result.id,
      title: r.result.title,
      category: r.result.category,
      description: r.result.description,
      contactPhone: r.result.contact_phone,
      createdAt: new Date(r.result.created_at),
    }));
  }
}
