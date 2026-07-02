import { Resend } from "resend";
import type { WelcomeMailer, WelcomeMailInput } from "@evzla/core";
import { renderWelcomeEmail } from "./templates/welcome-email";

const SUBJECT = "Bienvenido/a a EncuéntrameVzla — acceso habilitado";

// Adapter de correo transaccional con Resend. SDK externo SOLO aquí (core puro).
// Falla cerrado como el Turnstile verifier: sin API key, hace no-op (no bloquea el alta).
export class ResendWelcomeMailer implements WelcomeMailer {
  private readonly client: Resend | null;
  constructor(apiKey: string, private readonly from: string) {
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendWelcome(input: WelcomeMailInput): Promise<void> {
    if (!this.client) {
      // Sin secreto: no se envía (entornos locales/CI). No revienta el alta.
      console.warn("[welcome-mailer] RESEND_API_KEY ausente; se omite el correo de bienvenida.");
      return;
    }
    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.email,
      subject: SUBJECT,
      html: renderWelcomeEmail(input),
    });
    // El SDK no lanza en error de API: lo devuelve. Propagamos para que la capa
    // de aplicación lo capture (best-effort) sin volcar PII.
    if (error) {
      throw new Error(`resend send failed: ${error.name}`);
    }
  }
}
