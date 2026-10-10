import { describe, expect, it } from "vitest";
import { createAppSecrets } from "./app-secrets";

const FAKE = ["fake", "turnstile", "value"].join("-");

function recordingFetcher(payload: string | Error) {
  const calls: string[] = [];
  const fetchSecret = async (id: string): Promise<string> => {
    calls.push(id);
    if (payload instanceof Error) throw payload;
    return payload;
  };
  return { calls, fetchSecret };
}

describe("createAppSecrets", () => {
  it("con EVZLA_APP_SECRET lee del secreto JSON y lo pide una sola vez por contenedor", async () => {
    const { calls, fetchSecret } = recordingFetcher(
      JSON.stringify({ TURNSTILE_SECRET_KEY: FAKE, RATE_LIMIT_IP_SALT: "salt" }),
    );
    const appSecret = createAppSecrets({ EVZLA_APP_SECRET: "evzla/app", TURNSTILE_SECRET_KEY: "env" }, fetchSecret);
    expect(await appSecret("TURNSTILE_SECRET_KEY")).toBe(FAKE);
    expect(await appSecret("RATE_LIMIT_IP_SALT")).toBe("salt");
    expect(calls).toEqual(["evzla/app"]);
  });

  it("una clave ausente del secreto devuelve vacío (los adapters fallan cerrado)", async () => {
    const { fetchSecret } = recordingFetcher(JSON.stringify({}));
    const appSecret = createAppSecrets({ EVZLA_APP_SECRET: "evzla/app", RESEND_API_KEY: "env" }, fetchSecret);
    expect(await appSecret("RESEND_API_KEY")).toBe("");
  });

  it("sin EVZLA_APP_SECRET lee de process.env sin tocar Secrets Manager", async () => {
    const { calls, fetchSecret } = recordingFetcher(new Error("no debería llamarse"));
    const appSecret = createAppSecrets({ OPENAI_API_KEY: "env-openai" }, fetchSecret);
    expect(await appSecret("OPENAI_API_KEY")).toBe("env-openai");
    expect(await appSecret("ANTHROPIC_API_KEY")).toBe("");
    expect(calls).toEqual([]);
  });

  it("si Secrets Manager falla, propaga el error y reintenta en la siguiente lectura", async () => {
    let attempt = 0;
    const fetchSecret = async (): Promise<string> => {
      attempt += 1;
      if (attempt === 1) throw new Error("throttled");
      return JSON.stringify({ REVALIDATE_TOKEN: "tok" });
    };
    const appSecret = createAppSecrets({ EVZLA_APP_SECRET: "evzla/app" }, fetchSecret);
    await expect(appSecret("REVALIDATE_TOKEN")).rejects.toThrow("throttled");
    expect(await appSecret("REVALIDATE_TOKEN")).toBe("tok");
  });

  it("rechaza un secreto que no es JSON sin incluir su contenido", async () => {
    const { fetchSecret } = recordingFetcher(`not-json ${FAKE}`);
    const appSecret = createAppSecrets({ EVZLA_APP_SECRET: "evzla/app" }, fetchSecret);
    const error = await appSecret("TURNSTILE_SECRET_KEY").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(FAKE);
  });
});
