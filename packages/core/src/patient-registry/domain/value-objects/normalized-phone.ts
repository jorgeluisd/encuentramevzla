// Value object: teléfono normalizado. Señal media-fuerte de identidad. Compara por los
// últimos 7 dígitos para tolerar el prefijo de país y el 0 inicial de la operadora.
const LAST_DIGITS = 7;

export class NormalizedPhone {
  private constructor(
    readonly raw: string,
    readonly normalized: string,
  ) {}

  static fromRaw(raw: string): NormalizedPhone {
    return new NormalizedPhone(raw, raw.replace(/\D/g, ""));
  }

  get isValid(): boolean {
    return this.normalized.length >= LAST_DIGITS;
  }

  equals(other: NormalizedPhone): boolean {
    if (!this.isValid || !other.isValid) return false;
    return this.normalized.slice(-LAST_DIGITS) === other.normalized.slice(-LAST_DIGITS);
  }
}
