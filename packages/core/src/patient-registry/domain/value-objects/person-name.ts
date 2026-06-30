const DIACRITICS = /[̀-ͯ]/g;

// Value object: nombre normalizado + token-set (tolera el orden de las palabras).
export class PersonName {
  private constructor(
    readonly raw: string,
    readonly normalized: string,
    readonly tokens: readonly string[],
    // El nombre original incluía la palabra "menor": se quitó del nombre expuesto,
    // pero la señal se conserva aquí para registrarla en un campo NO expuesto.
    readonly flaggedMinor: boolean,
  ) {}

  static fromRaw(raw: string): PersonName {
    const { normalized, flaggedMinor } = normalize(raw);
    const tokens =
      normalized === "" ? [] : [...new Set(normalized.split(" "))].sort();
    return new PersonName(raw, normalized, tokens, flaggedMinor);
  }

  get isEmpty(): boolean {
    return this.normalized === "";
  }
}

function normalize(raw: string): { normalized: string; flaggedMinor: boolean } {
  const base = raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  // Privacidad: nunca exponer "menor de edad" en el nombre. Se elimina la palabra
  // exacta "menor" (no "menores"/"menorca"); la señal queda en `flaggedMinor`.
  const flaggedMinor = /\bmenor\b/.test(base);
  const normalized = base.replace(/\bmenor\b/g, " ").replace(/\s+/g, " ").trim();
  return { normalized, flaggedMinor };
}
