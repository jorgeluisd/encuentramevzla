import { fetchSecretString } from "./aws/secrets-manager";

export type AppSecretName =
  | "TURNSTILE_SECRET_KEY"
  | "RATE_LIMIT_IP_SALT"
  | "REVALIDATE_TOKEN"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "RESEND_API_KEY";

type Env = Record<string, string | undefined>;

// Con EVZLA_APP_SECRET (AWS) todo sale de ese secreto, sin mezclar con el entorno; si no, de process.env.
// Una clave ausente devuelve "" para que cada adapter falle cerrado como antes.
export function createAppSecrets(
  env: Env,
  fetchSecret: (secretId: string) => Promise<string>,
): (name: AppSecretName) => Promise<string> {
  let pending: Promise<Record<string, unknown>> | null = null;

  const load = (secretId: string): Promise<Record<string, unknown>> => {
    pending ??= fetchSecret(secretId).then(parseSecretJson);
    return pending.catch((error: unknown) => {
      pending = null;
      throw error;
    });
  };

  return async (name) => {
    const secretId = env.EVZLA_APP_SECRET;
    if (!secretId) return env[name] ?? "";
    const value = (await load(secretId))[name];
    return typeof value === "string" ? value : "";
  };
}

export const appSecret = createAppSecrets(process.env, fetchSecretString);

function parseSecretJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("EVZLA_APP_SECRET no contiene JSON válido.");
  }
}
