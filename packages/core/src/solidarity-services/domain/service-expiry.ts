// Vigencia de una publicación. Se fija al publicar y se renueva al aprobar/editar.
export const SERVICE_EXPIRY_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeExpiry(now: Date): Date {
  return new Date(now.getTime() + SERVICE_EXPIRY_DAYS * DAY_MS);
}
