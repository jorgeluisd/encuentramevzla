// Forma básica de email (privado: solo se usa para el enlace de gestión, nunca se publica).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SubmitterEmail {
  private constructor(readonly value: string) {}

  static fromRaw(raw: string): SubmitterEmail {
    return new SubmitterEmail(raw.trim().toLowerCase());
  }

  get isValid(): boolean {
    return EMAIL.test(this.value);
  }
}
