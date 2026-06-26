import "server-only";

import { cache } from "react";
import type { TeamMember } from "@evzla/core";
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
