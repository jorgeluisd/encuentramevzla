// Presentación: capitaliza el nombre normalizado (sin tildes) para mostrarlo a las familias.
// El normalizado viene en minúsculas y sin acentos; aquí solo se title-casa por palabra.
export function displayName(normalized: string): string {
  return normalized
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
