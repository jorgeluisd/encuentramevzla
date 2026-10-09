import { describe, expect, it } from "vitest";
import { CognitoTeamIdentityProvisioner } from "./cognito-team-identity-provisioner";
import type { CognitoSender } from "./cognito-email-otp";

function fakeCognito(error: Error | null) {
  const sent: { command: string; input: unknown }[] = [];
  const client = {
    send: async (cmd: { constructor: { name: string }; input: unknown }) => {
      sent.push({ command: cmd.constructor.name, input: cmd.input });
      if (error) throw error;
      return {};
    },
  } as unknown as CognitoSender;
  return { client, sent };
}

describe("CognitoTeamIdentityProvisioner", () => {
  it("crea el usuario sin contraseña, con email verificado y sin mensaje de Cognito", async () => {
    const { client, sent } = fakeCognito(null);
    await new CognitoTeamIdentityProvisioner(client, "pool-1").provision("nueva@example.com");
    expect(sent).toEqual([
      {
        command: "AdminCreateUserCommand",
        input: {
          UserPoolId: "pool-1",
          Username: "nueva@example.com",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: "nueva@example.com" },
            { Name: "email_verified", Value: "true" },
          ],
        },
      },
    ]);
  });

  it("es idempotente: si el usuario ya existe no falla", async () => {
    const exists = Object.assign(new Error("exists"), { name: "UsernameExistsException" });
    const { client } = fakeCognito(exists);
    await expect(
      new CognitoTeamIdentityProvisioner(client, "pool-1").provision("a@example.com"),
    ).resolves.toBeUndefined();
  });

  it("propaga cualquier otro error", async () => {
    const denied = Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    const { client } = fakeCognito(denied);
    await expect(
      new CognitoTeamIdentityProvisioner(client, "pool-1").provision("a@example.com"),
    ).rejects.toThrow("denied");
  });
});
