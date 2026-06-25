"use server";

import { contentHash, parsearExcel, type FilaCruda } from "@registro/ingesta";
// import { createServiceClient } from "@/lib/supabase/server";

/**
 * Server Action STUB para la ingesta de un Excel de pacientes.
 *
 * Flujo previsto (NO implementado todavía):
 *  1. Validar sesión/rol admin (esta ruta es protegida).
 *  2. Parsear el .xlsx con SheetJS y conservar las filas CRUDAS.
 *  3. Calcular content_hash por fila para idempotencia.
 *  4. Insertar en `public.staging_filas` con el cliente service-role.
 *  5. Disparar la dedup en la Supabase Edge Function `dedup` (fase 2, Deno).
 *
 * Aquí solo se demuestra el parseo; NO se escribe en base de datos.
 * Firma `(FormData) => Promise<void>` para poder enlazarla directo a `<form action>`.
 */
export async function subirExcelAction(formData: FormData): Promise<void> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    // TODO: devolver estado al cliente vía useActionState.
    return;
  }

  const buffer = new Uint8Array(await archivo.arrayBuffer());
  const { filas } = parsearExcel(buffer);

  // STUB: en producción aquí iría el upsert idempotente a staging_filas.
  const staging: { contentHash: string; filaCruda: FilaCruda }[] = filas.map(
    (filaCruda) => ({ contentHash: contentHash(filaCruda), filaCruda }),
  );
  // const supabase = createServiceClient();
  // await supabase.schema("public").from("staging_filas").upsert(staging, { onConflict: "content_hash" });
  // await supabase.functions.invoke("dedup", { body: { archivoId } });

  // eslint-disable-next-line no-console
  console.log(`[ingesta] parseadas ${staging.length} filas (stub: no se guardó nada).`);
}
