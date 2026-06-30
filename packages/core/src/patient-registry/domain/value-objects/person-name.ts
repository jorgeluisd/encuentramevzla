const DIACRITICS = /[̀-ͯ]/g;

// Value object: nombre normalizado + token-set (tolera el orden de las palabras).
export class PersonName {
  private constructor(
    readonly raw: string,
    readonly normalized: string,
    readonly tokens: readonly string[],
  ) {}

  static fromRaw(raw: string): PersonName {
    const normalized = normalize(raw);
    const tokens =
      normalized === "" ? [] : [...new Set(normalized.split(" "))].sort();
    return new PersonName(raw, normalized, tokens);
  }

  get isEmpty(): boolean {
    return this.normalized === "";
  }
}

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    // Privacidad: nunca exponer la condición de menor de edad. Se elimina la
    // palabra exacta "menor" (no "menores"/"menorca") si viene dentro del nombre.
    .replace(/\bmenor\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
