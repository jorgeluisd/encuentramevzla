"use server";

import { revalidatePath } from "next/cache";
import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { resolveReviewCaseUseCase } from "@/lib/composition";

/**
 * Registra la decisión del moderador sobre un caso dudoso (triage). Re-verifica el
 * rol server-side; no ejecuta la fusión (eso es una entrega aparte).
 */
export async function resolveReviewAction(formData: FormData): Promise<void> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    throw new Error("No autorizado.");
  }

  const patientId = String(formData.get("patientId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const candidateId = formData.get("candidateId");

  await resolveReviewCaseUseCase().execute({
    patientId,
    decision,
    candidateId: candidateId ? String(candidateId) : null,
    actorId: current.member.id,
  });

  revalidatePath("/admin/review");
}
