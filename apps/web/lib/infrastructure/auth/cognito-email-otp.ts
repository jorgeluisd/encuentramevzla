import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

export type CognitoSender = Pick<CognitoIdentityProviderClient, "send">;

export interface SessionTokens {
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Rechazos esperables del usuario (código malo, sesión vencida, usuario inexistente o deshabilitado).
// Todo lo demás es infraestructura y se propaga.
const REJECTIONS = new Set([
  "CodeMismatchException",
  "ExpiredCodeException",
  "NotAuthorizedException",
  "UserNotFoundException",
]);

function isRejection(error: unknown): boolean {
  return error instanceof Error && REJECTIONS.has(error.name);
}

// Inicio de sesión sin contraseña: flujo USER_AUTH con reto EMAIL_OTP (user pool Essentials).
export class CognitoEmailOtp {
  constructor(
    private readonly client: CognitoSender,
    private readonly clientId: string,
  ) {}

  async start(email: string): Promise<{ session: string } | null> {
    try {
      const out = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_AUTH",
          ClientId: this.clientId,
          AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: "EMAIL_OTP" },
        }),
      );
      return out.ChallengeName === "EMAIL_OTP" && out.Session ? { session: out.Session } : null;
    } catch (error) {
      if (isRejection(error)) return null;
      throw error;
    }
  }

  async verify(email: string, code: string, session: string): Promise<SessionTokens | null> {
    try {
      const out = await this.client.send(
        new RespondToAuthChallengeCommand({
          ClientId: this.clientId,
          ChallengeName: "EMAIL_OTP",
          Session: session,
          ChallengeResponses: { USERNAME: email, EMAIL_OTP_CODE: code },
        }),
      );
      const r = out.AuthenticationResult;
      if (!r?.IdToken || !r.RefreshToken) return null;
      return { idToken: r.IdToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn ?? 3600 };
    } catch (error) {
      if (isRejection(error)) return null;
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<SessionTokens | null> {
    try {
      const out = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: "REFRESH_TOKEN_AUTH",
          ClientId: this.clientId,
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        }),
      );
      const r = out.AuthenticationResult;
      if (!r?.IdToken) return null;
      return {
        idToken: r.IdToken,
        refreshToken: r.RefreshToken ?? refreshToken,
        expiresIn: r.ExpiresIn ?? 3600,
      };
    } catch (error) {
      if (isRejection(error)) return null;
      throw error;
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.client.send(new RevokeTokenCommand({ Token: refreshToken, ClientId: this.clientId }));
  }
}
