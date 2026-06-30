import { redirect } from "next/navigation";
import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { IngestaClient } from "./ingesta-client";

// Red de seguridad de tiempo para archivos grandes. Vercel Pro permite hasta 300s;
// el peso real lo lleva el bulk insert (segundos), esto evita el corte por timeout.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * `/admin/ingesta` — Carga masiva por Excel. Puede cargar a CUALQUIER hospital (por la columna
 * del archivo), por eso es SOLO para moderadores; el resto del personal usa /admin/cargar,
 * acotado a su hospital. El guard re-verifica server-side (no confía en la UI).
 */
export default async function AdminIngestaPage(): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") redirect("/admin/login");
  if (!canModerate(current.member.role)) redirect("/admin/cargar");
  return <IngestaClient />;
}
