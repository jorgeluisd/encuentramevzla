// Rol del personal verificado en el portal /admin. Coincide con el enum `team_role` de la DB.
export type Role = "uploader" | "moderator";

const ROLES: readonly Role[] = ["uploader", "moderator"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Ambos roles pueden subir listas.
export function canUpload(role: Role): boolean {
  return role === "uploader" || role === "moderator";
}

// Solo el moderador modera (revisión humana / audit log).
export function canModerate(role: Role): boolean {
  return role === "moderator";
}
