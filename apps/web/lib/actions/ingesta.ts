"use server";

import type { IngestionSummary } from "@evzla/core";
import { ingestPatientListUseCase } from "@/lib/composition";

/**
 * Server Action de ingesta. Delega en el caso de uso IngestPatientList
 * (composition root inyecta los adapters Drizzle/SheetJS).
 * TODO(auth): exigir sesión + rol uploader/moderador y registrar `uploadedBy`.
 */
export interface EstadoIngesta {
  ok: boolean;
  mensaje?: string;
  resumen?: IngestionSummary;
}

export async function subirExcelAction(
  _prev: EstadoIngesta,
  formData: FormData,
): Promise<EstadoIngesta> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Selecciona un archivo .xlsx válido." };
  }

  try {
    const fileBytes = new Uint8Array(await archivo.arrayBuffer());
    const resumen = await ingestPatientListUseCase().execute({ fileBytes, uploadedBy: null });
    return { ok: true, resumen };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "Error procesando el archivo.",
    };
  }
}
