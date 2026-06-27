"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { buildSearchTerm, type MediatedSearchResult } from "@evzla/core";
import { searchPatientsUseCase, verifyHumanChallengeUseCase } from "@/lib/composition";

/**
 * Server Action del buscador público. Es el ÚNICO camino a la búsqueda:
 *  1) verifica el reto humano (Cloudflare Turnstile) antes de tocar el RPC,
 *  2) deriva un hash de la IP (anti-abuso) para el rate-limit por fuente,
 *  3) delega en SearchPatients (RPC mediado).
 * No expone datos sensibles; el término viaja al RPC y solo se loguea su hash.
 */
export type SearchState =
  | { status: "idle" }
  | { status: "verification-failed" }
  | { status: "done"; term: string; result: MediatedSearchResult };

// Hash no reversible de la IP: nunca se guarda ni se mueve la IP en claro.
function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? "";
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

export async function searchAction(
  _prev: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const term = buildSearchTerm({
    name: String(formData.get("name") ?? ""),
    surname: String(formData.get("surname") ?? ""),
    documentId: String(formData.get("documentId") ?? ""),
  });
  const token = String(formData.get("cf-turnstile-response") ?? "");

  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";

  // Verificación humana. En dev sin secreto configurado se omite (Cloudflare da
  // claves de prueba para local); en prod, sin secreto, falla cerrado.
  const turnstileConfigured = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const skipVerification =
    process.env.NODE_ENV !== "production" && !turnstileConfigured;
  if (!skipVerification) {
    const human = await verifyHumanChallengeUseCase().execute(token, ip);
    if (!human) return { status: "verification-failed" };
  }

  const result = await searchPatientsUseCase().execute(term, hashIp(ip));
  return { status: "done", term, result };
}
