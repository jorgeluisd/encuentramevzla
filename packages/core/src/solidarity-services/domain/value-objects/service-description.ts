const MIN = 10;
const MAX = 1000;

// Value object: descripción del servicio. Texto visible al público.
export class ServiceDescription {
  private constructor(readonly value: string) {}

  static fromRaw(raw: string): ServiceDescription {
    return new ServiceDescription(raw.trim());
  }

  get isValid(): boolean {
    return this.value.length >= MIN && this.value.length <= MAX;
  }
}
