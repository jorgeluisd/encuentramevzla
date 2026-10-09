import { AdminCreateUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import type { TeamIdentityProvisioner } from "@evzla/core";
import type { CognitoSender } from "./cognito-email-otp";

// Alta sin contraseña (entra por EMAIL_OTP). SUPPRESS: el correo de bienvenida lo manda Resend.
export class CognitoTeamIdentityProvisioner implements TeamIdentityProvisioner {
  constructor(
    private readonly client: CognitoSender,
    private readonly userPoolId: string,
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
      if (error instanceof Error && error.name === "UsernameExistsException") return;
      throw error;
    }
  }
}
