// Estado de una publicación en su ciclo de vida.
// - pending:  enviada, esperando moderación (no visible al público).
// - approved: aprobada y visible en el directorio público (si no ha caducado).
// - rejected: rechazada por un moderador.
// - removed:  dada de baja por su dueño (vía enlace mágico).
// - expired:  caducada (fuera de la ventana de vigencia).
export type ServiceStatus = "pending" | "approved" | "rejected" | "removed" | "expired";

const STATUSES: readonly ServiceStatus[] = [
  "pending",
  "approved",
  "rejected",
  "removed",
  "expired",
];

export function isServiceStatus(value: string): value is ServiceStatus {
  return (STATUSES as readonly string[]).includes(value);
}

// "Activa" a efectos del límite de publicaciones por email: cuenta pending + approved.
export function isActiveStatus(status: ServiceStatus): boolean {
  return status === "pending" || status === "approved";
}
