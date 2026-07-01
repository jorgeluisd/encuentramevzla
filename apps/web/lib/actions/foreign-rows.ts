"use server";

import { revalidatePath } from "next/cache";
import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import {
  auditLogWriter,
  foreignRowsReader,
  ingestPatientListUseCase,
} from "@/lib/composition";

/**
 * Resuelve una fila segregada (ADR-0006). `reassign`: reingesta la fila cruda en el hospital
 * elegido (pasa por dedup) y la marca resuelta. `discard`: solo la marca resuelta. Solo moderador.
 */
export async function resolveForeignRowAction(
  decision: string,
  formData: FormData,
): Promise<void> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    throw new Error("No autorizado.");
  }
  const fingerprint = String(formData.get("fingerprint") ?? "");
  if (!fingerprint) throw new Error("Falta la fila.");

  if (decision === "reassign") {
    const hospitalId = String(formData.get("hospitalId") ?? "");
    if (!hospitalId) throw new Error("Elegí un hospital.");
    const parsed = await foreignRowsReader().loadParsedRow(fingerprint);
    if (!parsed) throw new Error("No se encontró la fila cruda.");
    await ingestPatientListUseCase().ingestParsed(
      { sheet: "reasignacion", rows: [parsed] },
      { uploadedBy: current.member.id, forcedHospitalId: hospitalId, skipRawPersist: true },
    );
    await auditLogWriter().record({
      actorId: current.member.id,
      action: "foreign_row_resolved",
      entity: "raw_rows",
      entityId: null,
      payload: { fingerprint, decision: "reassign", hospitalId },
    });
  } else {
    await auditLogWriter().record({
      actorId: current.member.id,
      action: "foreign_row_resolved",
      entity: "raw_rows",
      entityId: null,
      payload: { fingerprint, decision: "discard" },
    });
  }

  revalidatePath("/admin/foreign-rows");
}
