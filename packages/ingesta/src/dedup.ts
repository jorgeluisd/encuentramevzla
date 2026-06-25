/**
 * Helpers de deduplicación — funciones PURAS.
 * Espejo del lado app de lo que en Postgres harían `fuzzystrmatch` (levenshtein)
 * y `pg_trgm` (similitud por trigramas). Sirven para pre-rankear candidatos
 * antes de la dedup definitiva en el worker (apps/api).
 */
import { tokenSet } from "./normalize";

/** Distancia de Levenshtein (edición) entre dos cadenas. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

/** Conjunto de trigramas de una cadena (como `pg_trgm`, con padding de bordes). */
export function trigrams(input: string): Set<string> {
  const padded = `  ${input.trim()} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Similitud por trigramas en [0,1] (Jaccard sobre trigramas). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Similitud por token-set en [0,1] (Jaccard sobre tokens del nombre). */
export function tokenSetSimilarity(a: string, b: string): number {
  const sa = new Set(tokenSet(a));
  const sb = new Set(tokenSet(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Score combinado de dedup en [0,1]. STUB de ponderación: combina similitud de
 * trigramas y de token-set. El umbral/los pesos definitivos se calibrarán en el
 * worker de dedup (apps/api) con datos reales.
 */
export function scoreDedup(a: string, b: string): number {
  const tri = trigramSimilarity(a, b);
  const tok = tokenSetSimilarity(a, b);
  return 0.5 * tri + 0.5 * tok;
}
