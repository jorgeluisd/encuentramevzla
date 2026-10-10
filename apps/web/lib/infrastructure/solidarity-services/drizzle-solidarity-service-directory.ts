import { sql } from "drizzle-orm";
import type { ListPublishedInput, PublicService, SolidarityServiceDirectory } from "@evzla/core";
import type { RpcExecutor } from "../rpc-executor";
import { safeErrorTag } from "../safe-error";

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

// Lectura pública mediada (rol `public`): el RPC ya filtra a `approved` + vigentes y NO
// devuelve email ni token.
export class DrizzleSolidarityServiceDirectory implements SolidarityServiceDirectory {
  constructor(private readonly db: RpcExecutor) {}

  async list(input: ListPublishedInput): Promise<PublicService[]> {
    let rows: RpcRow[];
    try {
      rows = (await this.db.execute(
        sql`select result from public.list_solidarity_services(${input.category ?? null}, ${input.q ?? null})`,
      )) as unknown as RpcRow[];
    } catch (error) {
      console.error("[solidarity] RPC error:", safeErrorTag(error));
      return [];
    }
    return rows.map((r) => ({
      id: r.result.id,
      title: r.result.title,
      category: r.result.category,
      description: r.result.description,
      contactPhone: r.result.contact_phone,
      createdAt: new Date(r.result.created_at),
    }));
  }
}
