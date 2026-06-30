"use server";

import { revalidatePath } from "next/cache";
import { canResolveReview } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import {
  mergePatientsUseCase,
  resolveReviewCaseUseCase,
  reviewQueueReader,
} from "@/lib/composition";

/**
 * Registra la decisión sobre un caso dudoso (triage). Re-verifica server-side: el moderador
 * resuelve cualquier caso; el hospital_admin SOLO los de su hospital (P5). No es entrega aparte.
 */
export async function resolveReviewAction(
  decision: string,
  formData: FormData,
): Promise<void> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") throw new Error("No autorizado.");
  const member = current.member;

  const patientId = String(formData.get("patientId") ?? "");
  if (!patientId) throw new Error("Falta el paciente.");

  // Scope (P5): el caso debe estar en un hospital que el actor pueda resolver.
  const caseHospitals = (await reviewQueueReader().hospitalIdsOf([patientId])).get(patientId) ?? [];
  const allowed =
    member.role === "moderator" || caseHospitals.some((h) => canResolveReview(member, h));
  if (!allowed) throw new Error("No autorizado.");

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
