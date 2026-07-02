"use server";

import { revalidatePath } from "next/cache";
import {
  canManageHospitalTeam,
  EmailAlreadyMemberError,
  InvalidTeamInputError,
  isRole,
  TeamAdminForbiddenError,
  TeamMemberNotFoundError,
  type Role,
} from "@evzla/core";
import {
  inviteTeamMemberUseCase,
  resolveTeamMemberUseCase,
  setTeamMemberAccessUseCase,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/supabase/ssr-server";

export interface EstadoEquipo {
  ok: boolean;
  mensaje?: string;
}

const str = (formData: FormData, name: string): string | null => {
  const v = formData.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

// Re-verifica sesión + permiso de gestión de equipo server-side (defensa en profundidad).
async function requireManager(): Promise<
  | { ok: true; memberId: string; hospitalId: string | null; role: Role }
  | { ok: false; mensaje: string }
> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canManageHospitalTeam(resolved.member.role)) {
    return { ok: false, mensaje: "No tienes permiso para gestionar el equipo." };
  }
  return {
    ok: true,
    memberId: resolved.member.id,
    hospitalId: resolved.member.hospitalId,
    role: resolved.member.role,
  };
}

function mapError(error: unknown): EstadoEquipo {
  if (error instanceof TeamAdminForbiddenError) {
    return { ok: false, mensaje: "No tienes permiso para esta acción." };
  }
  if (error instanceof EmailAlreadyMemberError) {
    return { ok: false, mensaje: "Ese correo ya pertenece al equipo." };
  }
  if (error instanceof TeamMemberNotFoundError) {
    return { ok: false, mensaje: "El miembro ya no existe." };
  }
  if (error instanceof InvalidTeamInputError) {
    return { ok: false, mensaje: "Revisa los datos: correo válido y hospital cuando aplique." };
  }
  return { ok: false, mensaje: error instanceof Error ? error.message : "No se pudo completar." };
}

export async function invitarMiembroAction(
  _prev: EstadoEquipo,
  formData: FormData,
): Promise<EstadoEquipo> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const roleRaw = str(formData, "role");
  const role: Role = roleRaw && isRole(roleRaw) ? roleRaw : "uploader";
  try {
    const m = await inviteTeamMemberUseCase().execute({
      actor: { role: auth.role, hospitalId: auth.hospitalId },
      email: str(formData, "email") ?? "",
      role,
      hospitalId: str(formData, "hospitalId"),
    });
    revalidatePath("/admin/equipo");
    return {
      ok: true,
      mensaje: `${m.email} habilitado. Pídele que inicie sesión con su correo (magic-link).`,
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function setAccesoMiembroAction(
  _prev: EstadoEquipo,
  formData: FormData,
): Promise<EstadoEquipo> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const memberId = str(formData, "memberId");
  if (!memberId) return { ok: false, mensaje: "Falta el miembro." };

  const activeRaw = str(formData, "active");
  const roleRaw = str(formData, "role");
  const changes: { role?: Role; active?: boolean; hospitalId?: string | null } = {};
  if (activeRaw !== null) changes.active = activeRaw === "true";
  if (roleRaw && isRole(roleRaw)) changes.role = roleRaw;
  // Solo si el form incluye el campo hospital (moderador): vacío = null (global).
  if (formData.has("hospitalId")) changes.hospitalId = str(formData, "hospitalId");

  try {
    await setTeamMemberAccessUseCase().execute({
      actor: { role: auth.role, hospitalId: auth.hospitalId },
      memberId,
      changes,
    });
    revalidatePath("/admin/equipo");
    return { ok: true, mensaje: "Acceso actualizado." };
  } catch (error) {
    return mapError(error);
  }
}
