import { describe, expect, it } from "vitest";
import { CognitoEmailOtp, type CognitoSender } from "./cognito-email-otp";

type Sent = { command: string; input: unknown };

function fakeCognito(respond: (command: string, input: Record<string, unknown>) => unknown): {
  client: CognitoSender;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  const client = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ command: cmd.constructor.name, input: cmd.input });
      const out = respond(cmd.constructor.name, cmd.input);
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as CognitoSender;
  return { client, sent };
}

const named = (name: string): Error => Object.assign(new Error(name), { name });

describe("CognitoEmailOtp.start", () => {
  it("inicia USER_AUTH pidiendo EMAIL_OTP y devuelve la sesión del reto", async () => {
    const { client, sent } = fakeCognito(() => ({ ChallengeName: "EMAIL_OTP", Session: "sess-1" }));
    const result = await new CognitoEmailOtp(client, "client-id").start("nueva@example.com");
    expect(result).toEqual({ session: "sess-1" });
    expect(sent).toEqual([
      {
        command: "InitiateAuthCommand",
        input: {
          AuthFlow: "USER_AUTH",
          ClientId: "client-id",
          AuthParameters: { USERNAME: "nueva@example.com", PREFERRED_CHALLENGE: "EMAIL_OTP" },
        },
      },
    ]);
  });

  it("devuelve null si el usuario no existe o Cognito no ofrece EMAIL_OTP", async () => {
    const missing = fakeCognito(() => named("UserNotFoundException"));
    expect(await new CognitoEmailOtp(missing.client, "c").start("x@example.com")).toBeNull();
    const other = fakeCognito(() => ({ ChallengeName: "SELECT_CHALLENGE", Session: "s" }));
    expect(await new CognitoEmailOtp(other.client, "c").start("x@example.com")).toBeNull();
  });
});

describe("CognitoEmailOtp.verify", () => {
  it("responde el reto EMAIL_OTP y devuelve los tokens", async () => {
    const { client, sent } = fakeCognito(() => ({
      AuthenticationResult: { IdToken: "id", RefreshToken: "rt", ExpiresIn: 3600 },
    }));
    const tokens = await new CognitoEmailOtp(client, "client-id").verify("a@example.com", "12345678", "sess-1");
    expect(tokens).toEqual({ idToken: "id", refreshToken: "rt", expiresIn: 3600 });
    expect(sent[0]).toEqual({
      command: "RespondToAuthChallengeCommand",
      input: {
        ClientId: "client-id",
        ChallengeName: "EMAIL_OTP",
        Session: "sess-1",
        ChallengeResponses: { USERNAME: "a@example.com", EMAIL_OTP_CODE: "12345678" },
      },
    });
  });

  it("devuelve null con código inválido o vencido", async () => {
    const wrong = fakeCognito(() => named("CodeMismatchException"));
    expect(await new CognitoEmailOtp(wrong.client, "c").verify("a@example.com", "1", "s")).toBeNull();
    const expired = fakeCognito(() => named("NotAuthorizedException"));
    expect(await new CognitoEmailOtp(expired.client, "c").verify("a@example.com", "1", "s")).toBeNull();
  });

  it("propaga errores de infraestructura (no los confunde con código inválido)", async () => {
    const down = fakeCognito(() => named("InternalErrorException"));
    await expect(new CognitoEmailOtp(down.client, "c").verify("a@example.com", "1", "s")).rejects.toThrow();
  });
});

describe("CognitoEmailOtp.refresh", () => {
  it("usa REFRESH_TOKEN_AUTH y conserva el refresh token si Cognito no rota", async () => {
    const { client, sent } = fakeCognito(() => ({
      AuthenticationResult: { IdToken: "id-2", ExpiresIn: 3600 },
    }));
    const tokens = await new CognitoEmailOtp(client, "client-id").refresh("rt");
    expect(tokens).toEqual({ idToken: "id-2", refreshToken: "rt", expiresIn: 3600 });
    expect(sent[0]).toEqual({
      command: "InitiateAuthCommand",
      input: { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: "client-id", AuthParameters: { REFRESH_TOKEN: "rt" } },
    });
  });

  it("devuelve null si el refresh token fue revocado o venció", async () => {
    const { client } = fakeCognito(() => named("NotAuthorizedException"));
    expect(await new CognitoEmailOtp(client, "c").refresh("rt")).toBeNull();
  });
});

describe("CognitoEmailOtp.revoke", () => {
  it("revoca el refresh token del cliente", async () => {
    const { client, sent } = fakeCognito(() => ({}));
    await new CognitoEmailOtp(client, "client-id").revoke("rt");
    expect(sent).toEqual([{ command: "RevokeTokenCommand", input: { Token: "rt", ClientId: "client-id" } }]);
  });
});
