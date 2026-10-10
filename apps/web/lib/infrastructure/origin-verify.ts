import { createHash, timingSafeEqual } from "node:crypto";

export const ORIGIN_VERIFY_HEADER = "x-origin-verify";

// Solo CloudFront conoce el secreto: bloquea el acceso directo a la URL de la Lambda.
// Se comparan digests de largo fijo para que el tiempo no dependa del contenido ni del largo.
export function isOriginVerified(header: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  if (header === null) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(secret));
}
