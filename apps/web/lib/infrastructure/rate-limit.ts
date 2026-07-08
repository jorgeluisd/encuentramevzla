import "server-only";

import { createHash } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { actionRateLog } from "@evzla/db";
import { getDb } from "@evzla/db/client";

// Hash no reversible de la IP: nunca se guarda ni se mueve la IP en claro.
export function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? "";
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

// Límite de tasa por (clientHash, action) en una ventana. Devuelve true si se permite
// (y registra el intento); false si se superó el límite. Falla ABIERTO ante error de DB
// (no bloquea a un usuario legítimo por un problema de infraestructura).
export async function allowAction(
  clientHash: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - windowMs);
    const [row] = await db
      .select({ n: count() })
      .from(actionRateLog)
      .where(
        and(
          eq(actionRateLog.clientHash, clientHash),
          eq(actionRateLog.action, action),
          gt(actionRateLog.createdAt, since),
        ),
      );
    if ((row?.n ?? 0) >= limit) return false;
    await db.insert(actionRateLog).values({ clientHash, action });
    return true;
  } catch (error) {
    console.error("[rate-limit] fallo, se permite (fail-open):", error);
    return true;
  }
}
