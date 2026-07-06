const MIN = 3;
const MAX = 120;

// Value object: título del servicio ofrecido. Texto visible al público.
export class ServiceTitle {
  private constructor(readonly value: string) {}

  static fromRaw(raw: string): ServiceTitle {
    return new ServiceTitle(raw.trim());
  }

  get isValid(): boolean {
    return this.value.length >= MIN && this.value.length <= MAX;
  }
}
