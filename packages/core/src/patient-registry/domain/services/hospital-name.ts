const DIACRITICS = /[̀-ͯ]/g;
// Palabras genéricas de tipo de institución: se descartan para canonizar el nombre y
// hacer converger variantes ("H. Vargas" == "Hospital Vargas"). No se quitan nombres
// propios ni distintivos (Universitario, Dr., etc.).
const GENERIC = new Set(["hospital", "hosp", "h", "clinica", "centro", "ambulatorio", "cdi"]);

// Normalización fuerte del nombre de hospital: base para exacto/alias/fuzzy del catálogo.
export function normalizeHospitalName(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base
    .split(" ")
    .filter((token) => token !== "" && !GENERIC.has(token))
    .join(" ");
}
