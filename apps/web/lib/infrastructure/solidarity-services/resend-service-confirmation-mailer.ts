import { Resend } from "resend";
import type { ServiceConfirmationInput, ServiceConfirmationMailer } from "@evzla/core";
import { renderServiceConfirmationEmail } from "./templates/service-confirmation-email";

const SUBJECT = "Recibimos tu publicación — EncuéntrameVzla (Servicios solidarios)";

// Correo best-effort. Falla cerrado como el welcome-mailer: sin API key, no-op.
export class ResendServiceConfirmationMailer implements ServiceConfirmationMailer {
  private readonly client: Resend | null;
  constructor(apiKey: string, private readonly from: string) {
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendConfirmation(input: ServiceConfirmationInput): Promise<void> {
    if (!this.client) {
      console.warn("[service-mailer] RESEND_API_KEY ausente; se omite el correo de confirmación.");
      return;
    }
    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.email,
      subject: SUBJECT,
      html: renderServiceConfirmationEmail(input),
    });
    if (error) {
      throw new Error(`resend send failed: ${error.name}`);
    }
  }
}
