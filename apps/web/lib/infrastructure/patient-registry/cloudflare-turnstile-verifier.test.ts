import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareTurnstileVerifier } from "./cloudflare-turnstile-verifier";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock de fetch que captura url + body y devuelve la respuesta de siteverify dada.
function mockFetch(response: { success: boolean }): {
  calls: { url: string; body: URLSearchParams }[];
} {
  const calls: { url: string; body: URLSearchParams }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as URLSearchParams });
    return { json: async () => response } as Response;
  });
  return { calls };
}

describe("CloudflareTurnstileVerifier", () => {
  it("returns true when siteverify reports success", async () => {
    mockFetch({ success: true });
    const ok = await new CloudflareTurnstileVerifier("secret-key").verify("token-123");
    expect(ok).toBe(true);
  });

  it("returns false when siteverify reports failure", async () => {
    mockFetch({ success: false });
    const ok = await new CloudflareTurnstileVerifier("secret-key").verify("token-123");
    expect(ok).toBe(false);
  });

  it("posts secret, response token and remote ip to siteverify", async () => {
    const { calls } = mockFetch({ success: true });
    await new CloudflareTurnstileVerifier("secret-key").verify("token-123", "1.2.3.4");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(SITEVERIFY);
    expect(calls[0]!.body.get("secret")).toBe("secret-key");
    expect(calls[0]!.body.get("response")).toBe("token-123");
    expect(calls[0]!.body.get("remoteip")).toBe("1.2.3.4");
  });
});
