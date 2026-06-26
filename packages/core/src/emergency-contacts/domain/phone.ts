// Presentación de contactos: convierte un número mostrado (con espacios, paréntesis,
// guiones, prefijos) en un valor válido para href="tel:…".
// Conserva dígitos, el + inicial y los códigos cortos GSM (*, #); descarta el resto.
export function telHref(raw: string): string {
  const cleaned = raw.trim().replace(/[^\d+*#]/g, "");
  return `tel:${cleaned}`;
}
