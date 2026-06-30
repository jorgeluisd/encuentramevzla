// Rol del personal verificado en el portal /admin. Coincide con el enum `team_role` de la DB.
// - uploader:       carga/edita/descarga lo suyo (acotado a su hospital).
// - hospital_admin: lo del uploader + resuelve la cola de revisión de SU hospital + gestiona su personal.
// - moderator:      moderador global (resuelve/gestiona cualquier hospital). owner = moderador global.
export type Role = "uploader" | "hospital_admin" | "moderator";

const ROLES: readonly Role[] = ["uploader", "hospital_admin", "moderator"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Todos los roles pueden cargar pacientes.
export function canUpload(role: Role): boolean {
  return role === "uploader" || role === "hospital_admin" || role === "moderator";
}

// Solo el moderador global modera (revisión humana global / decide fusiones de cualquier hospital).
export function canModerate(role: Role): boolean {
  return role === "moderator";
}

// Gestionar personal del equipo: el moderador global (todos) o el hospital_admin (solo el suyo).
export function canManageHospitalTeam(role: Role): boolean {
  return role === "hospital_admin" || role === "moderator";
}

// Resolver la cola de revisión: el moderador global cualquier caso; el hospital_admin solo
// los de su propio hospital (scoping server-side). El uploader nunca resuelve.
export function canResolveReview(
  member: { role: Role; hospitalId: string | null },
  caseHospitalId: string | null,
): boolean {
  if (member.role === "moderator") return true;
  if (member.role === "hospital_admin") {
    return member.hospitalId !== null && member.hospitalId === caseHospitalId;
  }
  return false;
}
