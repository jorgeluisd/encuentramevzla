import { describe, expect, it } from "vitest";
import { CognitoTeamIdentityProvisioner, randomUnusedPassword } from "./cognito-team-identity-provisioner";
import type { CognitoSender } from "./cognito-email-otp";

const FIXED = ["unused", "Pw", "1!"].join("-");

function fakeCognito(failures: Record<string, Error> = {}) {
  const sent: { command: string; input: unknown }[] = [];
  const client = {
    send: async (cmd: { constructor: { name: string }; input: unknown }) => {
      sent.push({ command: cmd.constructor.name, input: cmd.input });
      const failure = failures[cmd.constructor.name];
      if (failure) throw failure;
      return {};
    },
  } as unknown as CognitoSender;
  return { client, sent };
}

const named = (name: string): Error => Object.assign(new Error(name), { name });

describe("CognitoTeamIdentityProvisioner", () => {
  it("crea el usuario sin mensaje de Cognito y lo deja CONFIRMED con una contraseña permanente que no se usa", async () => {
    const { client, sent } = fakeCognito();
    await new CognitoTeamIdentityProvisioner(client, "pool-1", () => FIXED).provision("nueva@example.com");
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
      {
        command: "AdminSetUserPasswordCommand",
        input: { UserPoolId: "pool-1", Username: "nueva@example.com", Password: FIXED, Permanent: true },
      },
    ]);
  });

  it("si el usuario ya existe, igual lo confirma (sale de FORCE_CHANGE_PASSWORD)", async () => {
    const { client, sent } = fakeCognito({ AdminCreateUserCommand: named("UsernameExistsException") });
    await new CognitoTeamIdentityProvisioner(client, "pool-1", () => FIXED).provision("a@example.com");
    expect(sent.map((s) => s.command)).toEqual(["AdminCreateUserCommand", "AdminSetUserPasswordCommand"]);
  });

  it("propaga cualquier otro error del alta sin fijar contraseña", async () => {
    const { client, sent } = fakeCognito({ AdminCreateUserCommand: named("AccessDeniedException") });
    await expect(
      new CognitoTeamIdentityProvisioner(client, "pool-1", () => FIXED).provision("a@example.com"),
    ).rejects.toThrow("AccessDeniedException");
    expect(sent.map((s) => s.command)).toEqual(["AdminCreateUserCommand"]);
  });

  it("propaga el error si no se puede confirmar al usuario", async () => {
    const { client } = fakeCognito({ AdminSetUserPasswordCommand: named("InvalidPasswordException") });
    await expect(
      new CognitoTeamIdentityProvisioner(client, "pool-1", () => FIXED).provision("a@example.com"),
    ).rejects.toThrow("InvalidPasswordException");
  });
});

describe("randomUnusedPassword", () => {
  it("es larga, distinta cada vez y cumple la política por defecto de Cognito", () => {
    const a = randomUnusedPassword();
    const b = randomUnusedPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/[0-9]/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
  });
});
