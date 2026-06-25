/**
 * Normalización de nombres — funciones PURAS (sin I/O), fáciles de testear.
 * Replica del lado app lo que `unaccent` hace en Postgres, para poder comparar
 * términos antes de tocar la base.
 */

/** Quita acentos/diacríticos (equivalente aproximado a la extensión `unaccent`). */
export function unaccent(input: string): string {
  // ̀-ͯ = bloque Unicode "Combining Diacritical Marks".
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza un nombre: sin acentos, minúsculas, sin signos de puntuación,
 * espacios colapsados. Resultado determinista.
 */
export function normalizarNombre(input: string): string {
  return unaccent(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokeniza un nombre normalizado en palabras únicas y ordenadas. */
export function tokenize(input: string): string[] {
  const normalizado = normalizarNombre(input);
  if (normalizado.length === 0) return [];
  return normalizado.split(" ");
}

/**
 * Conjunto de tokens ordenado (token-set). Útil para comparar nombres con el
 * orden de palabras alterado ("Juan Pérez" vs "Pérez Juan").
 */
export function tokenSet(input: string): string[] {
  return Array.from(new Set(tokenize(input))).sort();
}

/** Normaliza un número de documento: solo alfanumérico en mayúsculas. */
export function normalizarDocumento(input: string): string {
  return unaccent(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
