import { describe, expect, it } from "vitest";
import {
  decodePendingLogin,
  encodePendingLogin,
  resolveSession,
  sessionCookieOptions,
} from "./session";
import type { SessionTokens } from "./cognito-email-otp";

const tokens: SessionTokens = { idToken: "id-new", refreshToken: "rt-new", expiresIn: 3600 };

function deps(over: {
  valid?: Record<string, string>;
  refreshed?: SessionTokens | null;
}) {
  const refreshCalls: string[] = [];
  return {
    refreshCalls,
    verify: async (idToken: string) => over.valid?.[idToken] ?? null,
    refresh: async (rt: string) => {
      refreshCalls.push(rt);
      return over.refreshed ?? null;
    },
  };
}

describe("resolveSession", () => {
  it("id token válido: devuelve el email sin refrescar", async () => {
    const d = deps({ valid: { "id-ok": "ana@example.com" } });
    const r = await resolveSession({ idToken: "id-ok", refreshToken: "rt" }, d);
    expect(r).toEqual({ email: "ana@example.com" });
    expect(d.refreshCalls).toEqual([]);
  });

  it("id token vencido + refresh válido: refresca y pide guardar los tokens nuevos", async () => {
    const d = deps({ valid: { "id-new": "ana@example.com" }, refreshed: tokens });
    const r = await resolveSession({ idToken: "id-expired", refreshToken: "rt" }, d);
    expect(r).toEqual({ email: "ana@example.com", store: tokens });
    expect(d.refreshCalls).toEqual(["rt"]);
  });

  it("sin id token pero con refresh: también refresca", async () => {
    const d = deps({ valid: { "id-new": "ana@example.com" }, refreshed: tokens });
    const r = await resolveSession({ idToken: null, refreshToken: "rt" }, d);
    expect(r).toEqual({ email: "ana@example.com", store: tokens });
  });

  it("refresh revocado: sesión anónima y pide borrar las cookies", async () => {
    const d = deps({ refreshed: null });
    const r = await resolveSession({ idToken: "id-expired", refreshToken: "rt" }, d);
    expect(r).toEqual({ email: null, clear: true });
  });

  it("sin cookies: anónimo, sin tocar Cognito", async () => {
    const d = deps({});
    const r = await resolveSession({ idToken: null, refreshToken: null }, d);
    expect(r).toEqual({ email: null });
    expect(d.refreshCalls).toEqual([]);
  });
});

describe("sessionCookieOptions", () => {
  it("cookies httpOnly + secure + sameSite lax en todo el sitio", () => {
    expect(sessionCookieOptions(3600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });
});

describe("pending login cookie", () => {
  it("ida y vuelta de email + sesión del reto", () => {
    const value = encodePendingLogin({ email: "ana@example.com", session: "sess-1" });
    expect(value).not.toContain("ana@example.com");
    expect(decodePendingLogin(value)).toEqual({ email: "ana@example.com", session: "sess-1" });
  });

  it("valor manipulado o vacío → null", () => {
    expect(decodePendingLogin(undefined)).toBeNull();
    expect(decodePendingLogin("%%%")).toBeNull();
    expect(decodePendingLogin(Buffer.from(JSON.stringify({ email: 1 })).toString("base64url"))).toBeNull();
  });
});
