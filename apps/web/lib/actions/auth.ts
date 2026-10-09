"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cognitoEmailOtp } from "@/lib/auth/cognito";
import {
  decodePendingLogin,
  encodePendingLogin,
  ID_TOKEN_COOKIE,
  PENDING_LOGIN_COOKIE,
  PENDING_LOGIN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/infrastructure/auth/session";

export interface LoginState {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pide el código EMAIL_OTP. La respuesta es la misma exista o no el usuario (sin enumeración);
// quién entra de verdad lo decide la allow-list.
export async function requestLoginCodeAction(email: string): Promise<LoginState> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return { ok: false, error: "Escribe un correo válido." };
  try {
    const started = await cognitoEmailOtp().start(normalized);
    const store = await cookies();
    if (started) {
      store.set(
        PENDING_LOGIN_COOKIE,
        encodePendingLogin({ email: normalized, session: started.session }),
        sessionCookieOptions(PENDING_LOGIN_MAX_AGE),
      );
    } else {
      store.delete(PENDING_LOGIN_COOKIE);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No pudimos enviar el código. Intenta de nuevo en unos minutos." };
  }
}

export async function verifyLoginCodeAction(code: string): Promise<LoginState> {
  const store = await cookies();
  const pending = decodePendingLogin(store.get(PENDING_LOGIN_COOKIE)?.value);
  const invalid = { ok: false, error: "Código inválido o vencido. Pide uno nuevo." };
  if (!pending) return invalid;
  try {
    const tokens = await cognitoEmailOtp().verify(pending.email, code.trim(), pending.session);
    if (!tokens) return invalid;
    store.delete(PENDING_LOGIN_COOKIE);
    store.set(ID_TOKEN_COOKIE, tokens.idToken, sessionCookieOptions(tokens.expiresIn));
    store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, sessionCookieOptions(REFRESH_TOKEN_MAX_AGE));
    return { ok: true };
  } catch {
    return { ok: false, error: "No pudimos verificar el código. Intenta de nuevo." };
  }
}

/** Cierra la sesión del equipo (revoca el refresh token) y vuelve al login. */
export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    await cognitoEmailOtp()
      .revoke(refreshToken)
      .catch(() => undefined);
  }
  store.delete(ID_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
  redirect("/admin/login");
}
