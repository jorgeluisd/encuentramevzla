"use server";

import { revalidatePath } from "next/cache";
import {
  canUpload,
  CrossHospitalEditError,
  InvalidPatientError,
  PatientNotFoundError,
  type IngestionSummary,
  type ParsedPatientRow,
  type PatientStatus,
  type Role,
} from "@evzla/core";
import {
  editPatientUseCase,
  ingestPatientListUseCase,
  resolveTeamMemberUseCase,
  transcribePatientDictationUseCase,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/supabase/ssr-server";
import { rowFingerprint } from "@/lib/infrastructure/patient-registry/excel-parsing";

// Borrador editable que la UI muestra tras dictar (humano en el loop, nunca auto). D7.
export interface PacienteBorrador {
  fullName: string | null;
  age: number | null;
  documentNumber: string | null;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
  deceased: boolean;
}

export interface EstadoDictado {
  ok: boolean;
  mensaje?: string;
  transcript?: string;
  borrador?: PacienteBorrador;
}

// Re-verifica sesión + rol server-side (defensa en profundidad). Las acciones de voz/manual
// no confían en el guard de la UI.
async function requireUploader(): Promise<
  | { ok: true; memberId: string; hospitalId: string | null; role: Role }
  | { ok: false; mensaje: string }
> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canUpload(resolved.member.role)) {
    return { ok: false, mensaje: "No tienes permiso para cargar pacientes." };
  }
  return {
    ok: true,
    memberId: resolved.member.id,
    hospitalId: resolved.member.hospitalId,
    role: resolved.member.role,
  };
}

const STATUSES: readonly PatientStatus[] = [
  "admitted",
  "transferred",
  "discharged",
  "located",
  "deceased",
];

function asStatus(value: FormDataEntryValue | null): PatientStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
    ? (value as PatientStatus)
    : "admitted";
}

// Dicta un paciente: STT + extracción. NO guarda nada; el audio se descarta tras transcribir (D7).
export async function dictarPacienteAction(formData: FormData): Promise<EstadoDictado> {
  const auth = await requireUploader();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, mensaje: "No se recibió audio. Intenta grabar de nuevo." };
  }

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const { transcript, rows } = await transcribePatientDictationUseCase().execute({
      audio: bytes,
      opts: { language: "es", mimeType: audio.type || "audio/webm" },
    });
    const first = rows[0];
    const borrador: PacienteBorrador = {
      fullName: first?.fullName ?? null,
      age: first?.age ?? null,
      documentNumber: first?.documentNumber ?? null,
      phone: first?.phone ?? null,
      address: first?.address ?? null,
      clinicalNotes: first?.clinicalNotes ?? null,
      deceased: first?.deceased ?? false,
    };
    return { ok: true, transcript, borrador };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "No se pudo procesar el dictado.",
    };
  }
}

export interface EstadoConfirmacion {
  ok: boolean;
  mensaje?: string;
  resumen?: IngestionSummary;
}

const campo = (formData: FormData, name: string): string | null => {
  const v = formData.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

// Confirma el dictado editado (o un alta manual): arma UNA fila y la mete por ingestParsed con
// el hospital forzado (scoped). El humano ya revisó los campos. Reusa dedup/merge/menor/audit.
export async function confirmarDictadoAction(
  _prev: EstadoConfirmacion,
  formData: FormData,
): Promise<EstadoConfirmacion> {
  const auth = await requireUploader();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };

  // Hospital objetivo: el miembro acotado SOLO el suyo; el global elige uno (server-side).
  const hospitalId = auth.hospitalId ?? campo(formData, "hospitalId");
  if (!hospitalId) {
    return { ok: false, mensaje: "Falta el hospital del paciente." };
  }

  const fullName = campo(formData, "fullName");
  const documentNumber = campo(formData, "documentNumber");
  // Validez (D9): al menos nombre o cédula.
  if (!fullName && !documentNumber) {
    return { ok: false, mensaje: "Indica al menos el nombre o la cédula." };
  }

  const ageRaw = campo(formData, "age");
  const ageNum = ageRaw ? parseInt(ageRaw.replace(/[^0-9]/g, ""), 10) : NaN;
  const transcript = campo(formData, "transcript");

  // raw sintético con el transcript (si vino de voz) para trazabilidad/idempotencia.
  const raw: Record<string, unknown> = {
    transcript,
    fullName,
    documentNumber,
    age: ageRaw,
    phone: campo(formData, "phone"),
    address: campo(formData, "address"),
    clinicalNotes: campo(formData, "clinicalNotes"),
    // "¿Falleció?" se retiró de la UI: el estado (select) es la única fuente.
    deceased: asStatus(formData.get("status")) === "deceased",
  };
  const fila: ParsedPatientRow = {
    fingerprint: rowFingerprint(raw),
    raw,
    hospitalName: null, // ignorado: el hospital va forzado
    fullName,
    age: Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120 ? null : ageNum,
    documentNumber,
    phone: campo(formData, "phone"),
    address: campo(formData, "address"),
    clinicalNotes: campo(formData, "clinicalNotes"),
    deceased: raw.deceased === true,
  };

  try {
    const resumen = await ingestPatientListUseCase().ingestParsed(
      { sheet: "captura", rows: [fila] },
      { uploadedBy: auth.memberId, forcedHospitalId: hospitalId },
    );
    revalidatePath("/");
    revalidatePath("/admin/cargar");
    return { ok: true, resumen };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "No se pudo guardar el paciente.",
    };
  }
}

// Alta manual: mismo camino que la confirmación de dictado (un paciente → ingestParsed forzado),
// solo que sin transcript. El panel de confirmación es compartido (D10).
export async function cargarPacienteManualAction(
  prev: EstadoConfirmacion,
  formData: FormData,
): Promise<EstadoConfirmacion> {
  return confirmarDictadoAction(prev, formData);
}

export interface EstadoEdicion {
  ok: boolean;
  mensaje?: string;
}

// Editar (no borrar) un paciente propio (D11). Recalcula value objects y queda auditado; scoped.
export async function editarPacienteAction(
  _prev: EstadoEdicion,
  formData: FormData,
): Promise<EstadoEdicion> {
  const auth = await requireUploader();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };

  const patientId = campo(formData, "patientId");
  if (!patientId) return { ok: false, mensaje: "Falta el paciente a editar." };

  const ageRaw = campo(formData, "age");
  const ageNum = ageRaw ? parseInt(ageRaw.replace(/[^0-9]/g, ""), 10) : NaN;

  try {
    await editPatientUseCase().execute({
      actor: { role: auth.role, hospitalId: auth.hospitalId },
      actorId: auth.memberId,
      patientId,
      fields: {
        fullName: campo(formData, "fullName"),
        age: Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120 ? null : ageNum,
        documentNumber: campo(formData, "documentNumber"),
        phone: campo(formData, "phone"),
        address: campo(formData, "address"),
        clinicalNotes: campo(formData, "clinicalNotes"),
        status: asStatus(formData.get("status")),
        // "¿Falleció?" se retiró de la UI: el estado (select) es la única fuente.
        deceased: asStatus(formData.get("status")) === "deceased",
      },
    });
    revalidatePath("/");
    revalidatePath("/admin/cargar");
    return { ok: true };
  } catch (error) {
    if (error instanceof CrossHospitalEditError) {
      return { ok: false, mensaje: "No puedes editar pacientes de otro hospital." };
    }
    if (error instanceof PatientNotFoundError) {
      return { ok: false, mensaje: "El paciente ya no existe." };
    }
    if (error instanceof InvalidPatientError) {
      return { ok: false, mensaje: "Indica al menos el nombre o la cédula." };
    }
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : "No se pudo editar el paciente.",
    };
  }
}
