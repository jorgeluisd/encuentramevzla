import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createContentHashFetch, installContentHashFetch } from "./content-hash-fetch";

const ORIGIN = "https://example.test";
const HEADER = "x-amz-content-sha256";

type Sent = { input: RequestInfo | URL; init: RequestInit | undefined };

function recordingFetch() {
  const calls: Sent[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response("ok");
  };
  return { fetch, calls };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sentRequest(call: Sent | undefined): Promise<{ header: string | null; bytes: Uint8Array; contentType: string | null }> {
  if (!call) throw new Error("no call recorded");
  const input = call.input instanceof Request ? call.input : new URL(String(call.input), ORIGIN);
  const request = new Request(input, call.init);
  return {
    header: request.headers.get(HEADER),
    bytes: new Uint8Array(await request.arrayBuffer()),
    contentType: request.headers.get("content-type"),
  };
}

function build(fetch: ReturnType<typeof recordingFetch>["fetch"], subtle: SubtleCrypto | null = globalThis.crypto.subtle) {
  return createContentHashFetch({ fetch, origin: ORIGIN, subtle: subtle ?? undefined });
}

describe("createContentHashFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes the exact UTF-8 bytes of a same-origin string body", async () => {
    const { fetch, calls } = recordingFetch();
    const body = "Ñandú Pérez 🦜 V-00000000";

    await build(fetch)("/buscar", { method: "POST", body });

    const sent = await sentRequest(calls[0]);
    const expectedBytes = new TextEncoder().encode(body);
    expect(sent.bytes).toEqual(expectedBytes);
    expect(sent.header).toBe(sha256Hex(expectedBytes));
  });

  it("serializes a FormData body once and hashes the multipart bytes it sends", async () => {
    const { fetch, calls } = recordingFetch();
    const form = new FormData();
    form.set("name", "Persona Prueba");
    form.set("file", new Blob([new Uint8Array([0, 255, 1, 254])]), "sample.bin");

    await build(fetch)("/admin/ingesta", { method: "POST", body: form });

    const sent = await sentRequest(calls[0]);
    const boundary = sent.contentType?.match(/^multipart\/form-data; boundary=(.+)$/)?.[1];
    expect(boundary).toBeDefined();
    expect(new TextDecoder().decode(sent.bytes)).toContain(`--${boundary}`);
    expect(new TextDecoder().decode(sent.bytes)).toContain("Persona Prueba");
    expect(sent.header).toBe(sha256Hex(sent.bytes));
  });

  it.each(["GET", "HEAD", "get"])("passes a same-origin %s through untouched", async (method) => {
    const { fetch, calls } = recordingFetch();
    const init = { method };

    await build(fetch)("/buscar?q=x", init);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/buscar?q=x");
    expect(calls[0]?.init).toBe(init);
  });

  it.each([
    "https://bucket.example.test/uploads/key?X-Amz-Signature=fake",
    "https://evil.test/buscar",
    "http://example.test/buscar",
  ])("sends a cross-origin PUT to %s exactly as given", async (target) => {
    const { fetch, calls } = recordingFetch();
    const body = new Blob([new Uint8Array([1, 2, 3])], { type: "application/vnd.ms-excel" });
    const init = { method: "PUT", body, headers: { "content-type": "application/vnd.ms-excel" } };

    await build(fetch)(target, init);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(target);
    expect(calls[0]?.init).toBe(init);
  });

  it("sends the request unchanged and without throwing when crypto.subtle is unavailable", async () => {
    const { fetch, calls } = recordingFetch();
    const init = { method: "POST", body: "Persona Prueba" };

    await expect(build(fetch, null)("/buscar", init)).resolves.toBeInstanceOf(Response);

    expect(calls[0]?.input).toBe("/buscar");
    expect(calls[0]?.init).toBe(init);
  });

  it("falls back to the original arguments without logging when hashing fails", async () => {
    const { fetch, calls } = recordingFetch();
    const failingSubtle = { digest: () => Promise.reject(new Error("synthetic failure")) } as unknown as SubtleCrypto;
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const form = new FormData();
    form.set("q", "V-00000000");
    const init = { method: "POST", body: form };

    await build(fetch, failingSubtle)("/buscar", init);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/buscar");
    expect(calls[0]?.init).toBe(init);
    expect(form.get("q")).toBe("V-00000000");
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it.each(["PUT", "PATCH", "DELETE", "post"])("signs a same-origin %s with a string body", async (method) => {
    const { fetch, calls } = recordingFetch();

    await build(fetch)(`${ORIGIN}/api/x`, { method, body: "Persona Prueba" });

    const sent = await sentRequest(calls[0]);
    expect(sent.header).toBe(sha256Hex(new TextEncoder().encode("Persona Prueba")));
  });

  it("hashes an empty POST as the SHA-256 of the empty string", async () => {
    const { fetch, calls } = recordingFetch();

    await build(fetch)("/api/revalidate", { method: "POST" });

    const sent = await sentRequest(calls[0]);
    expect(sent.bytes).toHaveLength(0);
    expect(sent.header).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("signs a same-origin Request object and keeps its method and content type", async () => {
    const { fetch, calls } = recordingFetch();
    const request = new Request(`${ORIGIN}/buscar`, {
      method: "POST",
      body: JSON.stringify({ q: "Persona Prueba" }),
      headers: { "content-type": "application/json", "next-action": "abc" },
    });

    await build(fetch)(request);

    const sent = await sentRequest(calls[0]);
    expect(sent.contentType).toBe("application/json");
    expect((calls[0]?.input as Request).method).toBe("POST");
    expect((calls[0]?.input as Request).headers.get("next-action")).toBe("abc");
    expect(sent.header).toBe(sha256Hex(new TextEncoder().encode(JSON.stringify({ q: "Persona Prueba" }))));
  });

  it("hashes each call from its own body, also when the same FormData is sent twice", async () => {
    const { fetch, calls } = recordingFetch();
    const form = new FormData();
    form.set("q", "Persona Prueba");
    const intercepted = build(fetch);

    await intercepted("/buscar", { method: "POST", body: form });
    await intercepted("/buscar", { method: "POST", body: form });

    const first = await sentRequest(calls[0]);
    const second = await sentRequest(calls[1]);
    expect(first.header).toBe(sha256Hex(first.bytes));
    expect(second.header).toBe(sha256Hex(second.bytes));
  });

  it("does not mix bodies across concurrent calls", async () => {
    const { fetch, calls } = recordingFetch();
    const intercepted = build(fetch);
    const bodies = ["Persona Prueba", "V-00000000", "Ñandú"];

    await Promise.all(bodies.map((body) => intercepted("/buscar", { method: "POST", body })));

    const sent = await Promise.all(calls.map(sentRequest));
    expect(sent.map((s) => new TextDecoder().decode(s.bytes)).sort()).toEqual([...bodies].sort());
    for (const s of sent) expect(s.header).toBe(sha256Hex(s.bytes));
  });

  it("propagates a network error once, without retrying", async () => {
    let attempts = 0;
    const failing = async () => {
      attempts += 1;
      throw new TypeError("synthetic network error");
    };

    await expect(build(failing)("/buscar", { method: "POST", body: "x" })).rejects.toThrow("synthetic network error");
    expect(attempts).toBe(1);
  });

  it("passes a bare same-origin call through untouched (default GET)", async () => {
    const { fetch, calls } = recordingFetch();

    await build(fetch)("/");

    expect(calls[0]?.input).toBe("/");
    expect(calls[0]?.init).toBeUndefined();
  });
});

describe("content-hash-fetch source", () => {
  it("has no way to leave a trace of bodies or hashes", () => {
    const source = readFileSync(fileURLToPath(new URL("./content-hash-fetch.ts", import.meta.url)), "utf8");
    const forbidden = ["console.", "localStorage", "sessionStorage", "indexedDB", "sendBeacon", "XMLHttpRequest", "catch ("];

    expect(forbidden.filter((token) => source.includes(token))).toEqual([]);
  });
});

describe("installContentHashFetch", () => {
  it("replaces window.fetch with the hashing wrapper bound to the window", async () => {
    const receivers: unknown[] = [];
    const sent: Request[] = [];
    const win = {
      location: { origin: ORIGIN },
      crypto: { subtle: globalThis.crypto.subtle },
      fetch(this: unknown, input: RequestInfo | URL, _init?: RequestInit) {
        receivers.push(this);
        sent.push(input as Request);
        return Promise.resolve(new Response("ok"));
      },
    };

    installContentHashFetch(win);
    await win.fetch("/buscar", { method: "POST", body: "Persona Prueba" });

    expect(receivers).toEqual([win]);
    expect(sent[0]?.headers.get(HEADER)).toBe(sha256Hex(new TextEncoder().encode("Persona Prueba")));
  });
});
