"use server";

import { procesarExcel, type ResumenIngesta } from "@/lib/ingesta/procesar";

/**
 * Server Action de ingesta de un Excel de pacientes.
 *
 * Corre en el servidor (Node): parsea, preserva el crudo en staging (idempotente),
 * deduplica y escribe persona/ingreso + datos sensibles vía conexión directa Drizzle.
 * Devuelve un resumen para mostrarlo en la UI (patrón useActionState).
 *
 * TODO(auth): exigir sesión + rol uploader/moderador y registrar `subidoPor` real.
 */
export interface EstadoIngesta {
  ok: boolean;
  mensaje?: string;
  resumen?: ResumenIngesta;
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
    const buffer = new Uint8Array(await archivo.arrayBuffer());
    const resumen = await procesarExcel(buffer);
    return { ok: true, resumen };
  } catch (error) {
    return {
      ok: false,
      mensaje:
        error instanceof Error ? error.message : "Error procesando el archivo.",
    };
  }
}
