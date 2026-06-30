const DIACRITICS = /[̀-ͯ]/g;
// Marcadores de fallecimiento escritos dentro del nombre (palabra exacta, sin
// diacríticos: "falleció" ya llega como "fallecio"). No usa el stem suelto
// (fallec/muert) para no morder apellidos legítimos como "Murillo".
const DECEASED_MARK = /\b(fallecid[oa]s?|fallecio|murio|muert[oa]s?)\b/g;

// Value object: nombre normalizado + token-set (tolera el orden de las palabras).
export class PersonName {
  private constructor(
    readonly raw: string,
    readonly normalized: string,
    readonly tokens: readonly string[],
    // El nombre original incluía la palabra "menor": se quitó del nombre expuesto,
    // pero la señal se conserva aquí para registrarla en un campo NO expuesto.
    readonly flaggedMinor: boolean,
    // Idem: el nombre incluía un marcador de fallecimiento. Se quita del nombre
    // expuesto y la señal se conserva para marcar el estado (NO expuesto en claro).
    readonly flaggedDeceased: boolean,
  ) {}

  static fromRaw(raw: string): PersonName {
    const { normalized, flaggedMinor, flaggedDeceased } = normalize(raw);
    const tokens =
      normalized === "" ? [] : [...new Set(normalized.split(" "))].sort();
    return new PersonName(raw, normalized, tokens, flaggedMinor, flaggedDeceased);
  }

  get isEmpty(): boolean {
    return this.normalized === "";
  }
}

function normalize(raw: string): {
  normalized: string;
  flaggedMinor: boolean;
  flaggedDeceased: boolean;
} {
  const base = raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  // Privacidad: nunca exponer "menor de edad" en el nombre. Se elimina la palabra
  // exacta "menor" (no "menores"/"menorca"); la señal queda en `flaggedMinor`.
  const flaggedMinor = /\bmenor\b/.test(base);
  // Privacidad: nunca exponer el fallecimiento en el nombre; la señal queda aparte.
  const flaggedDeceased = DECEASED_MARK.test(base);
  const normalized = base
    .replace(/\bmenor\b/g, " ")
    .replace(DECEASED_MARK, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { normalized, flaggedMinor, flaggedDeceased };
}
