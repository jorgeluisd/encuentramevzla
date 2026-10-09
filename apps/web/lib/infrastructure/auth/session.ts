import type { SessionTokens } from "./cognito-email-otp";

export const ID_TOKEN_COOKIE = "evzla_id";
export const REFRESH_TOKEN_COOKIE = "evzla_rt";
export const PENDING_LOGIN_COOKIE = "evzla_otp";

// Debe coincidir con la validez del refresh token del app client de Cognito (default 30 días).
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;
export const PENDING_LOGIN_MAX_AGE = 15 * 60;

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}

export type ResolvedSession =
  | { email: string; store?: SessionTokens }
  | { email: null; clear?: true };

export async function resolveSession(
  cookies: { idToken: string | null; refreshToken: string | null },
  deps: {
    verify: (idToken: string) => Promise<string | null>;
    refresh: (refreshToken: string) => Promise<SessionTokens | null>;
  },
): Promise<ResolvedSession> {
  if (cookies.idToken) {
    const email = await deps.verify(cookies.idToken);
    if (email) return { email };
  }
  if (!cookies.refreshToken) return { email: null };
  const tokens = await deps.refresh(cookies.refreshToken);
  const email = tokens ? await deps.verify(tokens.idToken) : null;
  return tokens && email ? { email, store: tokens } : { email: null, clear: true };
}

export interface PendingLogin {
  email: string;
  session: string;
}

export function encodePendingLogin(pending: PendingLogin): string {
  return Buffer.from(JSON.stringify(pending)).toString("base64url");
}

export function decodePendingLogin(value: string | undefined): PendingLogin | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PendingLogin>;
    return typeof parsed.email === "string" && typeof parsed.session === "string"
      ? { email: parsed.email, session: parsed.session }
      : null;
  } catch {
    return null;
  }
}
