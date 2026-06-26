"use server";

import { revalidatePath } from "next/cache";
import { canUpload, type IngestionSummary } from "@evzla/core";
import {
  ingestPatientListUseCase,
  resolveTeamMemberUseCase,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/supabase/ssr-server";

/**
 * Server Action de ingesta. Re-verifica la sesión + membresía server-side (defensa
 * en profundidad, no confía en el guard de la UI) y registra `uploadedBy` real.
 */
export interface EstadoIngesta {
  ok: boolean;
  mensaje?: string;
  resumen?: IngestionSummary;
  uploadedByEmail?: string;
}

export async function subirExcelAction(
  _prev: EstadoIngesta,
  formData: FormData,
): Promise<EstadoIngesta> {
  // 1. Autorización (sesión + membresía activa + rol que puede subir).
  const email = await getSessionEmail();
  if (!email) {
    return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  }
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canUpload(resolved.member.role)) {
    return { ok: false, mensaje: "No tienes permiso para subir listas." };
  }
  const member = resolved.member;

  // 2. Validación del archivo.
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Selecciona un archivo .xlsx válido." };
  }

  // 3. Procesar con el uploader real.
  try {
    const fileBytes = new Uint8Array(await archivo.arrayBuffer());
    const resumen = await ingestPatientListUseCase().execute({
      fileBytes,
      uploadedBy: member.id,
    });
    // Regenera el home estático para refrescar el sello "última actualización".
    revalidatePath("/");
    return { ok: true, resumen, uploadedByEmail: member.email };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "Error procesando el archivo.",
    };
  }
}
