"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canUpload, type IngestionSummary, type TeamMember } from "@evzla/core";
import {
  ingestPatientListUseCase,
  resolveTeamMemberUseCase,
  uploadStore,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/auth/session";
import { isOwnUploadKey, newUploadKey } from "@/lib/infrastructure/uploads/s3-upload-store";

/**
 * Server Actions de ingesta. Re-verifican la sesión + membresía server-side (defensa
 * en profundidad, no confían en el guard de la UI) y registran `uploadedBy` real.
 */
export interface EstadoIngesta {
  ok: boolean;
  mensaje?: string;
  resumen?: IngestionSummary;
  uploadedByEmail?: string;
}

export type SubidaExcel =
  | { mode: "direct" }
  | { mode: "s3"; url: string; key: string }
  | { mode: "error"; mensaje: string };

const MAX_EXCEL_BYTES = 25 * 1024 * 1024;

async function requireUploader(): Promise<{ ok: true; member: TeamMember } | { ok: false; mensaje: string }> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canUpload(resolved.member.role)) {
    return { ok: false, mensaje: "No tienes permiso para subir listas." };
  }
  return { ok: true, member: resolved.member };
}

// Paso 1 (AWS): URL prefirmada para que el navegador suba el .xlsx directo a S3.
export async function prepararSubidaExcelAction(archivo: { name: string; size: number }): Promise<SubidaExcel> {
  const auth = await requireUploader();
  if (!auth.ok) return { mode: "error", mensaje: auth.mensaje };
  if (!archivo.name.toLowerCase().endsWith(".xlsx") || archivo.size <= 0) {
    return { mode: "error", mensaje: "Selecciona un archivo .xlsx válido." };
  }
  if (archivo.size > MAX_EXCEL_BYTES) {
    return { mode: "error", mensaje: "El archivo supera el máximo de 25 MB." };
  }
  const store = uploadStore();
  if (!store) return { mode: "direct" };
  const key = newUploadKey(auth.member.id, randomUUID());
  return { mode: "s3", url: await store.presignPut(key, archivo.size), key };
}

async function leerArchivo(
  formData: FormData,
  member: TeamMember,
): Promise<{ bytes: Uint8Array; key: string | null } | null> {
  const key = formData.get("objectKey");
  const store = uploadStore();
  if (typeof key === "string" && key !== "") {
    if (!store || !isOwnUploadKey(key, member.id)) return null;
    return { bytes: await store.read(key, MAX_EXCEL_BYTES), key };
  }
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0 || archivo.size > MAX_EXCEL_BYTES) return null;
  return { bytes: new Uint8Array(await archivo.arrayBuffer()), key: null };
}

export async function subirExcelAction(
  _prev: EstadoIngesta,
  formData: FormData,
): Promise<EstadoIngesta> {
  const auth = await requireUploader();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const member = auth.member;

  // Hospital objetivo. Acotado → SIEMPRE el suyo (no manipulable, D4). Global → el que mande el
  // form: Cargar fuerza el hospital seleccionado; Ingesta no lo manda → por columna del Excel.
  const formHospitalId = (() => {
    const v = formData.get("hospitalId");
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  })();
  const forcedHospitalId = member.hospitalId ?? formHospitalId;

  let key: string | null = null;
  try {
    const archivo = await leerArchivo(formData, member);
    if (!archivo) return { ok: false, mensaje: "Selecciona un archivo .xlsx válido." };
    key = archivo.key;
    const resumen = await ingestPatientListUseCase().execute({
      fileBytes: archivo.bytes,
      uploadedBy: member.id,
      forcedHospitalId,
    });
    // Regenera el home estático para refrescar el sello "última actualización".
    revalidatePath("/");
    return { ok: true, resumen, uploadedByEmail: member.email };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "Error procesando el archivo.",
    };
  } finally {
    // El Excel trae datos personales: no se deja en S3 más de lo necesario (el ciclo de vida es el respaldo).
    if (key) await uploadStore()?.delete(key).catch(() => undefined);
  }
}
