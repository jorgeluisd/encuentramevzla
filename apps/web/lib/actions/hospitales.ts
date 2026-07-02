"use server";

import { revalidatePath } from "next/cache";
import {
  canModerate,
  InvalidTeamInputError,
  TeamAdminForbiddenError,
  type Role,
} from "@evzla/core";
import {
  createHospitalUseCase,
  resolveTeamMemberUseCase,
  updateHospitalUseCase,
} from "@/lib/composition";
import { getSessionEmail } from "@/lib/supabase/ssr-server";

export interface EstadoHospital {
  ok: boolean;
  mensaje?: string;
}

const str = (formData: FormData, name: string): string | null => {
  const v = formData.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

const bool = (formData: FormData, name: string): boolean => formData.get(name) === "true";

// Re-verifica sesión + rol moderador server-side (defensa en profundidad).
async function requireModerator(): Promise<
  { ok: true; role: Role } | { ok: false; mensaje: string }
> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, mensaje: "Sesión no válida. Vuelve a iniciar sesión." };
  const resolved = await resolveTeamMemberUseCase().execute(email);
  if (resolved.kind !== "authorized" || !canModerate(resolved.member.role)) {
    return { ok: false, mensaje: "Solo un moderador puede gestionar hospitales." };
  }
  return { ok: true, role: resolved.member.role };
}

function mapError(error: unknown): EstadoHospital {
  if (error instanceof TeamAdminForbiddenError) {
    return { ok: false, mensaje: "No tienes permiso para esta acción." };
  }
  if (error instanceof InvalidTeamInputError) {
    return { ok: false, mensaje: "Revisa los datos: el nombre del hospital es obligatorio." };
  }
  return { ok: false, mensaje: error instanceof Error ? error.message : "No se pudo completar." };
}

export async function crearHospitalAction(
  _prev: EstadoHospital,
  formData: FormData,
): Promise<EstadoHospital> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  try {
    const h = await createHospitalUseCase().execute({
      actor: { role: auth.role },
      name: str(formData, "name") ?? "",
      city: str(formData, "city"),
      infoDeskPhone: str(formData, "infoDeskPhone"),
    });
    revalidatePath("/admin/hospitales");
    return { ok: true, mensaje: `Hospital "${h.name}" creado.` };
  } catch (error) {
    return mapError(error);
  }
}

export async function actualizarHospitalAction(
  _prev: EstadoHospital,
  formData: FormData,
): Promise<EstadoHospital> {
  const auth = await requireModerator();
  if (!auth.ok) return { ok: false, mensaje: auth.mensaje };
  const id = str(formData, "id");
  if (!id) return { ok: false, mensaje: "Falta el hospital." };
  try {
    await updateHospitalUseCase().execute({
      actor: { role: auth.role },
      id,
      changes: {
        name: str(formData, "name") ?? "",
        city: str(formData, "city"),
        infoDeskPhone: str(formData, "infoDeskPhone"),
        active: bool(formData, "active"),
        test: bool(formData, "test"),
      },
    });
    revalidatePath("/admin/hospitales");
    return { ok: true, mensaje: "Hospital actualizado." };
  } catch (error) {
    return mapError(error);
  }
}
