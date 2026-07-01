"use server";

import { revalidatePath } from "next/cache";
import { canResolveReview } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import {
  mergePatientsUseCase,
  resolveReviewCaseUseCase,
  reviewQueueReader,
} from "@/lib/composition";

// Estado del formulario (useActionState). `error: null` = ok; si hay texto, el botón corta
// el spinner y lo muestra en vez de quedarse "Procesando…" para siempre.
export interface ReviewActionState {
  error: string | null;
}

/**
 * Registra la decisión sobre un caso dudoso (triage). Re-verifica server-side: el moderador
 * resuelve cualquier caso; el hospital_admin SOLO los de su hospital (P5). Nunca lanza: cualquier
 * fallo vuelve como `{ error }` para que la UI no quede colgada (spinner infinito).
 */
export async function resolveReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const decision = String(formData.get("decision") ?? "");
    if (decision !== "merge" && decision !== "keep") {
      return { error: "Acción inválida." };
    }

    const current = await getCurrentMember();
    if (current.kind !== "authorized") return { error: "No autorizado." };
    const member = current.member;

    const patientId = String(formData.get("patientId") ?? "");
    if (!patientId) return { error: "Falta el paciente." };

    // Scope (P5): el caso debe estar en un hospital que el actor pueda resolver.
    const caseHospitals = (await reviewQueueReader().hospitalIdsOf([patientId])).get(patientId) ?? [];
    const allowed =
      member.role === "moderator" || caseHospitals.some((h) => canResolveReview(member, h));
    if (!allowed) return { error: "No autorizado." };

    const candidate = formData.get("candidateId")
      ? String(formData.get("candidateId"))
      : null;

    // Fusionar ejecuta de verdad: el candidato (canónico) sobrevive, el registro
    // dudoso se funde y se elimina. Sin candidato no se puede fusionar.
    if (decision === "merge") {
      if (!candidate) return { error: "No hay candidato para fusionar." };
      await mergePatientsUseCase().execute({
        targetId: candidate,
        sourceId: patientId,
        actorId: member.id,
      });
    }

    await resolveReviewCaseUseCase().execute({
      patientId,
      decision,
      candidateId: candidate,
      actorId: member.id,
    });

    revalidatePath("/admin/review");
    return { error: null };
  } catch {
    // No filtramos el detalle técnico al usuario; el rastro queda en logs del servidor.
    return { error: "No se pudo completar la acción. Reintentá." };
  }
}
