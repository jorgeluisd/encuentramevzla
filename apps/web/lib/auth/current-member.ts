import "server-only";

import { cache } from "react";
import {
  canManageHospitalTeam,
  canResolveReview,
  type TeamMember,
} from "@evzla/core";
import { getSessionEmail } from "@/lib/supabase/ssr-server";
import { resolveTeamMemberUseCase } from "@/lib/composition";

export type CurrentMember =
  | { kind: "anonymous" }
  | { kind: "unauthorized"; email: string }
  | { kind: "authorized"; member: TeamMember };

/**
 * Resuelve la sesión actual contra la allow-list. Envuelto en `cache()` para
 * deduplicar la consulta dentro de un mismo request (layout + página la comparten).
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const email = await getSessionEmail();
  if (!email) return { kind: "anonymous" };
  const result = await resolveTeamMemberUseCase().execute(email);
  if (result.kind !== "authorized") return { kind: "unauthorized", email };
  return { kind: "authorized", member: result.member };
});

// --- Helpers de scope server-side (defensa en profundidad sobre el dominio) ---

// Hospital del miembro autenticado; `null` = global (owner/moderador) o sin sesión.
export function memberHospitalId(current: CurrentMember): string | null {
  return current.kind === "authorized" ? current.member.hospitalId : null;
}

// ¿Puede gestionar (invitar) personal de un equipo? hospital_admin (el suyo) o moderador global.
export function memberCanManageHospitalTeam(current: CurrentMember): boolean {
  return current.kind === "authorized" && canManageHospitalTeam(current.member.role);
}

// ¿Puede resolver un caso de la cola de revisión? Moderador global (cualquiera) o
// hospital_admin SOLO de su propio hospital. Scoping server-side (D5/P5).
export function memberCanResolveReview(
  current: CurrentMember,
  caseHospitalId: string | null,
): boolean {
  return current.kind === "authorized" && canResolveReview(current.member, caseHospitalId);
}
