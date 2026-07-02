import type { Role } from "../../domain/value-objects/team-role";

// Datos del correo de bienvenida a un miembro recién habilitado.
// hospitalName es null para el moderador global (sin hospital asignado).
// manualUrl es opcional: si falta, el correo omite el bloque del manual.
export interface WelcomeMailInput {
  email: string;
  hospitalName: string | null;
  role: Role;
  loginUrl: string;
  manualUrl?: string | null;
}

// Port de envío del correo de bienvenida. Lo implementa un adapter externo (Resend);
// el dominio queda agnóstico del proveedor. El envío es best-effort en la capa de
// aplicación: un fallo aquí NO debe revertir el alta del miembro.
export interface WelcomeMailer {
  sendWelcome(input: WelcomeMailInput): Promise<void>;
}
