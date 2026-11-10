import { describe, expect, it, vi } from "vitest";
import { handleRevalidate } from "./revalidate-request";

const TOKEN = "token-sintetico-de-prueba";

function post(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/revalidate", { method: "POST", headers });
}

function deps(token = TOKEN) {
  return { token, revalidate: vi.fn<() => void>() };
}

describe("handleRevalidate", () => {
  it("revalidates the home when x-revalidate-token matches (AC-15)", async () => {
    const d = deps();
    const response = await handleRevalidate(post({ "x-revalidate-token": TOKEN }), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, revalidated: "/" });
    expect(d.revalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", {}],
    ["wrong", { "x-revalidate-token": "otro-token-sintetico" }],
    ["empty", { "x-revalidate-token": "" }],
  ])("rejects a %s x-revalidate-token with 401 unauthorized (AC-16)", async (_case, headers) => {
    const d = deps();
    const response = await handleRevalidate(post(headers), d);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "unauthorized" });
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", {}],
    ["an empty header", { "x-revalidate-token": "" }],
  ])("answers 503 not_configured when the secret is empty, with %s", async (_case, headers) => {
    const d = deps("");
    const response = await handleRevalidate(post(headers), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "not_configured" });
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it("ignores a valid Authorization: Bearer token without x-revalidate-token (AC-17)", async () => {
    const d = deps();
    const response = await handleRevalidate(post({ authorization: `Bearer ${TOKEN}` }), d);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "unauthorized" });
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it("never reads the body, logs or echoes the token (AC-18)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const request = new Request("https://example.test/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-token": TOKEN },
      body: "cuerpo-sintetico",
    });
    const response = await handleRevalidate(request, deps());
    expect(request.bodyUsed).toBe(false);
    expect(await response.text()).not.toContain(TOKEN);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
