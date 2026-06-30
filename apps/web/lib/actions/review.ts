"use server";

import { revalidatePath } from "next/cache";
import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import {
  mergePatientsUseCase,
  resolveReviewCaseUseCase,
} from "@/lib/composition";

/**
 * Registra la decisión del moderador sobre un caso dudoso (triage). Re-verifica el
 * rol server-side; no ejecuta la fusión (eso es una entrega aparte).
 */
export async function resolveReviewAction(
  decision: string,
  formData: FormData,
): Promise<void> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    throw new Error("No autorizado.");
  }

  const patientId = String(formData.get("patientId") ?? "");
  const candidate = formData.get("candidateId")
    ? String(formData.get("candidateId"))
    : null;

  // Fusionar ejecuta de verdad: el candidato (canónico) sobrevive, el registro
  // dudoso se funde y se elimina. Sin candidato no se puede fusionar.
  if (decision === "merge") {
    if (!candidate) throw new Error("No hay candidato para fusionar.");
    await mergePatientsUseCase().execute({
      targetId: candidate,
      sourceId: patientId,
      actorId: current.member.id,
    });
  }

  await resolveReviewCaseUseCase().execute({
    patientId,
    decision,
    candidateId: candidate,
    actorId: current.member.id,
  });

  revalidatePath("/admin/review");
}
