import { randomBytes } from "node:crypto";
import { AdminCreateUserCommand, AdminSetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import type { TeamIdentityProvisioner } from "@evzla/core";
import type { CognitoSender } from "./cognito-email-otp";

// 48 caracteres aleatorios + un carácter de cada clase que exige la política por defecto del pool.
export function randomUnusedPassword(): string {
  return `${randomBytes(36).toString("base64url")}aA1!`;
}

// Alta sin contraseña utilizable (entra por EMAIL_OTP). SUPPRESS: el correo de bienvenida lo manda
// Resend. La contraseña permanente solo saca al usuario de FORCE_CHANGE_PASSWORD; no se guarda.
export class CognitoTeamIdentityProvisioner implements TeamIdentityProvisioner {
  constructor(
    private readonly client: CognitoSender,
    private readonly userPoolId: string,
    private readonly newPassword: () => string = randomUnusedPassword,
  ) {}

  async provision(email: string): Promise<void> {
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
          ],
        }),
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === "UsernameExistsException")) throw error;
    }
    await this.client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        Password: this.newPassword(),
        Permanent: true,
      }),
    );
  }
}
