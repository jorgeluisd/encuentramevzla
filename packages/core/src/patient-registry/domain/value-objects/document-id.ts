const DIACRITICS = /[̀-ͯ]/g;

// Value object: documento normalizado; válido como señal fuerte solo con ≥ 6 dígitos.
export class DocumentId {
  private constructor(
    readonly raw: string,
    readonly normalized: string,
  ) {}

  static fromRaw(raw: string): DocumentId {
    const normalized = raw
      .normalize("NFD")
      .replace(DIACRITICS, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return new DocumentId(raw, normalized);
  }

  get isValid(): boolean {
    return (this.normalized.match(/\d/g)?.length ?? 0) >= 6;
  }
}
