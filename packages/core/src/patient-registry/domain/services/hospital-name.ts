import { trigramSimilarity } from "./string-similarity";

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

export interface HospitalCandidate {
  id: string;
  normalized: string;
}

// Umbral de similitud para adoptar un hospital existente del catálogo como canónico.
export const HOSPITAL_MATCH = 0.6;

// Mejor coincidencia del catálogo para un nombre YA normalizado; null si ninguna llega
// al umbral (→ es un hospital genuinamente nuevo, que se crea provisional para revisión).
export function matchHospital(
  normalized: string,
  catalog: readonly HospitalCandidate[],
): string | null {
  if (normalized === "") return null;
  let bestId: string | null = null;
  let bestScore = 0;
  for (const c of catalog) {
    const score = c.normalized === normalized ? 1 : trigramSimilarity(normalized, c.normalized);
    if (score > bestScore) {
      bestScore = score;
      bestId = c.id;
    }
  }
  return bestScore >= HOSPITAL_MATCH ? bestId : null;
}
