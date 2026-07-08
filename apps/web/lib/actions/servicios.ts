"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  canModerate,
  InvalidServiceInputError,
  ServiceModerationForbiddenError,
  ServiceNotFoundError,
  type ServiceInputField,
  TermsNotAcceptedError,
  TooManyActiveServicesError,
  type Role,
} from "@evzla/core";
import {
  approveServiceUseCase,
  dismissReportUseCase,
  editServiceByTokenUseCase,
  regenerateManageLinkUseCase,
  rejectServiceUseCase,
  removeServiceByTokenUseCase,
  reportServiceUseCase,
  resolveTeamMemberUseCase,
  serviceConfirmationMailer,
  submitSolidarityServiceUseCase,
  takeDownServiceUseCase,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/supabase/ssr-server";
import { verifyHumanChallengeUseCase } from "@/lib/composition";
import { allowAction, hashIp } from "@/lib/infrastructure/rate-limit";

// Límites de tasa por IP hasheada para escrituras públicas (anti-abuso/DoS).
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const SUBMIT_LIMIT = 5;
const REPORT_LIMIT = 12;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://encuentramevzla.com";

const str = (formData: FormData, name: string): string => String(formData.get(name) ?? "").trim();

// --- Alta pública ---

export type SubmitServiceState =
  | { status: "idle" }
  | { status: "verification-failed" }
  | { status: "invalid"; mensaje: string }
  | { status: "done" };

// Mensaje concreto por campo (incluye el mínimo) para que el usuario sepa QUÉ corregir.
const FIELD_MESSAGE: Record<ServiceInputField, string> = {
  title: "El título debe tener al menos 3 caracteres.",
  category: "Elige una categoría de la lista.",
  description: "La descripción debe tener al menos 10 caracteres.",
  contactPhone: "El teléfono debe incluir al menos 7 dígitos.",
  submitterEmail: "Revisa tu correo electrónico.",
};

function mapSubmitError(error: unknown): SubmitServiceState {
  if (error instanceof TermsNotAcceptedError) {
    return { status: "invalid", mensaje: "Debes aceptar los términos de publicación." };
  }
  if (error instanceof TooManyActiveServicesError) {
    return {
      status: "invalid",
      mensaje: "Ya tienes 3 publicaciones activas con este correo. Da de baja alguna antes.",
    };
  }
  if (error instanceof InvalidServiceInputError) {
    const detalle = error.fields.map((f) => FIELD_MESSAGE[f]).join(" ");
    return {
      status: "invalid",
      mensaje: detalle || "Revisa los datos: título, categoría, descripción y teléfono.",
    };
  }
  return {
    status: "invalid",
    mensaje: error instanceof Error ? "No se pudo publicar. Intenta de nuevo." : "No se pudo publicar.",
  };
}

export async function submitServiceAction(
  _prev: SubmitServiceState,
  formData: FormData,
): Promise<SubmitServiceState> {
  const token = str(formData, "cf-turnstile-response");
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";

  // Verificación humana anti-spam (mismo criterio que el buscador: dev sin secreto se omite).
  const turnstileConfigured = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const skipVerification = process.env.NODE_ENV !== "production" && !turnstileConfigured;
  if (!skipVerification) {
    const human = await verifyHumanChallengeUseCase().execute(token, ip);
    if (!human) return { status: "verification-failed" };
  }

  // Rate-limit por IP hasheada (además del captcha): frena abuso de altas.
  if (!(await allowAction(hashIp(ip), "submit", SUBMIT_LIMIT, RATE_WINDOW_MS))) {
    return {
      status: "invalid",
      mensaje: "Has enviado varias publicaciones seguidas. Espera unos minutos e intenta de nuevo.",
    };
  }

  try {
    const result = await submitSolidarityServiceUseCase().execute({
      title: str(formData, "title"),
      category: str(formData, "category"),
      description: str(formData, "description"),
      contactPhone: str(formData, "contactPhone"),
      submitterEmail: str(formData, "submitterEmail"),
      acceptedTerms: formData.get("acceptedTerms") === "on" || formData.get("acceptedTerms") === "true",
    });

    // Confirmación best-effort con el enlace mágico de gestión (no revierte el alta si falla).
    try {
      await serviceConfirmationMailer().sendConfirmation({
        email: str(formData, "submitterEmail"),
        editUrl: `${SITE_URL}/servicios/editar/${result.editToken}`,
      });
    } catch (error) {
      console.error("[service-mailer] envío fallido:", error);
    }

    revalidatePath("/servicios");
    return { status: "done" };
  } catch (error) {
    return mapSubmitError(error);
  }
}

// --- Gestión por enlace mágico (dueño, sin cuenta) ---

export interface EstadoGestion {
  ok: boolean;
  mensaje?: string;
}

function mapTokenError(error: unknown): EstadoGestion {
  if (error instanceof ServiceNotFoundError) {
    return { ok: false, mensaje: "El enlace no es válido o la publicación ya no existe." };
  }
  if (error instanceof InvalidServiceInputError) {
    return { ok: false, mensaje: "Revisa los datos ingresados." };
  }
  return { ok: false, mensaje: "No se pudo completar la acción." };
}

export async function editServiceAction(
  _prev: EstadoGestion,
  formData: FormData,
): Promise<EstadoGestion> {
  const rawToken = str(formData, "token");
  try {
    await editServiceByTokenUseCase().execute({
      rawToken,
      changes: {
        title: str(formData, "title"),
        category: str(formData, "category"),
        description: str(formData, "description"),
        contactPhone: str(formData, "contactPhone"),
      },
    });
    revalidatePath("/servicios");
    return { ok: true, mensaje: "Actualizado. Volverá a revisión antes de publicarse." };
  } catch (error) {
    return mapTokenError(error);
  }
}

export async function removeServiceAction(
  _prev: EstadoGestion,
  formData: FormData,
): Promise<EstadoGestion> {
  const rawToken = str(formData, "token");
  try {
    await removeServiceByTokenUseCase().execute({ rawToken });
    revalidatePath("/servicios");
    return { ok: true, mensaje: "Tu publicación fue dada de baja." };
  } catch (error) {
    return mapTokenError(error);
  }
}

// --- Reporte público (sin sesión, anti-bot con Turnstile) ---

export type ReportState =
  | { status: "idle" }
  | { status: "verification-failed" }
  | { status: "done" }
  | { status: "error" };

export async function reportServiceAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { status: "error" };

  const token = str(formData, "cf-turnstile-response");
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const turnstileConfigured = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const skipVerification = process.env.NODE_ENV !== "production" && !turnstileConfigured;
  if (!skipVerification) {
    const human = await verifyHumanChallengeUseCase().execute(token, ip);
    if (!human) return { status: "verification-failed" };
  }

  // Rate-limit por IP hasheada: frena spam de reportes.
  if (!(await allowAction(hashIp(ip), "report", REPORT_LIMIT, RATE_WINDOW_MS))) {
    return { status: "error" };
  }

  try {
    await reportServiceUseCase().execute({ serviceId, reason: str(formData, "reason") });
    revalidatePath("/admin/servicios");
    return { status: "done" };
  } catch {
    return { status: "error" };
  }
}

// --- Moderación (staff, rol moderator) ---

export interface EstadoModeracion {
  ok: boolean;
  mensaje?: string;
}

// Re-verifica sesión + rol moderador server-side (defensa en profundidad).
async function requireModerator(): Promise<
  { ok: true; memberId: string; role: Role } | { ok: false; mensaje: string }
> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canModerate(resolved.member.role)) {
    return { ok: false, mensaje: "No tienes permiso para moderar servicios." };
  }
  return { ok: true, memberId: resolved.member.id, role: resolved.member.role };
}

function mapModerationError(error: unknown): EstadoModeracion {
  if (error instanceof ServiceModerationForbiddenError) {
    return { ok: false, mensaje: "No tienes permiso para esta acción." };
  }
  return { ok: false, mensaje: "No se pudo completar." };
}

export async function approveServiceAction(
  _prev: EstadoModeracion,
  formData: FormData,
): Promise<EstadoModeracion> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { ok: false, mensaje: "Falta la publicación." };
  try {
    await approveServiceUseCase().execute({
      serviceId,
      actorRole: auth.role,
      reviewerId: auth.memberId,
    });
    revalidatePath("/admin/servicios");
    revalidatePath("/servicios");
    return { ok: true, mensaje: "Publicación aprobada." };
  } catch (error) {
    return mapModerationError(error);
  }
}

export async function rejectServiceAction(
  _prev: EstadoModeracion,
  formData: FormData,
): Promise<EstadoModeracion> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { ok: false, mensaje: "Falta la publicación." };
  try {
    await rejectServiceUseCase().execute({
      serviceId,
      actorRole: auth.role,
      reviewerId: auth.memberId,
      reason: str(formData, "reason") || "No cumple los términos de publicación.",
    });
    revalidatePath("/admin/servicios");
    return { ok: true, mensaje: "Publicación rechazada." };
  } catch (error) {
    return mapModerationError(error);
  }
}

// Baja administrativa (moderador): retira la publicación del directorio.
export async function takeDownServiceAction(
  _prev: EstadoModeracion,
  formData: FormData,
): Promise<EstadoModeracion> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { ok: false, mensaje: "Falta la publicación." };
  try {
    await takeDownServiceUseCase().execute({ serviceId, actorRole: auth.role });
    revalidatePath("/admin/servicios");
    revalidatePath("/servicios");
    return { ok: true, mensaje: "Publicación dada de baja." };
  } catch (error) {
    return mapModerationError(error);
  }
}

// Descartar el reporte de una publicación (moderador): la mantiene publicada.
export async function dismissReportAction(
  _prev: EstadoModeracion,
  formData: FormData,
): Promise<EstadoModeracion> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { ok: false, mensaje: "Falta la publicación." };
  try {
    await dismissReportUseCase().execute({ serviceId, actorRole: auth.role });
    revalidatePath("/admin/servicios");
    return { ok: true, mensaje: "Reporte descartado. La publicación se mantiene." };
  } catch (error) {
    return mapModerationError(error);
  }
}

// Reenvía al autor el enlace de gestión. Regenera el token (invalida el anterior,
// como un "restablecer"): el enlace viejo deja de funcionar y se envía uno nuevo.
export async function resendManageLinkAction(
  _prev: EstadoModeracion,
  formData: FormData,
): Promise<EstadoModeracion> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const serviceId = str(formData, "serviceId");
  if (!serviceId) return { ok: false, mensaje: "Falta la publicación." };
  try {
    const { email, editToken } = await regenerateManageLinkUseCase().execute({
      serviceId,
      actorRole: auth.role,
    });
    await serviceConfirmationMailer().sendConfirmation({
      email,
      editUrl: `${SITE_URL}/servicios/editar/${editToken}`,
    });
    return { ok: true, mensaje: `Enlace de gestión reenviado a ${email}.` };
  } catch (error) {
    console.error("[service-mailer] reenvío fallido:", error);
    return mapModerationError(error);
  }
}
