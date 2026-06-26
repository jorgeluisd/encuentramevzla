// Similitud de cadenas — funciones puras. Espejo en app de pg_trgm / fuzzystrmatch.

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

// Trigramas con relleno de bordes (como pg_trgm).
export function trigrams(value: string): Set<string> {
  const padded = `  ${value.trim()} `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) result.add(padded.slice(i, i + 3));
  return result;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function trigramSimilarity(a: string, b: string): number {
  return jaccard(trigrams(a), trigrams(b));
}

export function tokenSetSimilarity(
  a: readonly string[],
  b: readonly string[],
): number {
  return jaccard(new Set(a), new Set(b));
}
