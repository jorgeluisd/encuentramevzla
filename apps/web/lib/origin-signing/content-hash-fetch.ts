type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const CONTENT_HASH_HEADER = "x-amz-content-sha256";
const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ContentHashFetchDeps = {
  fetch: Fetch;
  location: { readonly href: string };
  subtle: SubtleCrypto | undefined;
};

export type ContentHashFetchTarget = {
  fetch: Fetch;
  location: { readonly href: string };
  crypto?: { subtle?: SubtleCrypto | undefined };
};

function methodOf(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Serializa una sola vez con `new Request` y envía esos mismos bytes: el hash firmado por
// CloudFront (OAC) debe coincidir con el body que llega a la Function URL (ADR-0012).
async function withContentHash(
  subtle: SubtleCrypto,
  input: RequestInfo | URL,
  url: URL,
  init: RequestInit | undefined,
): Promise<Request> {
  const source = new Request(input instanceof Request ? input.clone() : url, init);
  const bytes = await source.clone().arrayBuffer();
  const headers = new Headers(source.headers);
  headers.set(CONTENT_HASH_HEADER, toHex(await subtle.digest("SHA-256", bytes)));
  return new Request(source, { headers, body: bytes });
}

export function createContentHashFetch(deps: ContentHashFetchDeps): Fetch {
  return async (input, init) => {
    if (!METHODS_WITH_BODY.has(methodOf(input, init))) return deps.fetch(input, init);
    const page = new URL(deps.location.href);
    const url = new URL(input instanceof Request ? input.url : String(input), page);
    if (url.origin !== page.origin || !deps.subtle) return deps.fetch(input, init);
    let prepared: Request;
    try {
      prepared = await withContentHash(deps.subtle, input, url, init);
    } catch {
      return deps.fetch(input, init);
    }
    return deps.fetch(prepared);
  };
}

export function installContentHashFetch(win: ContentHashFetchTarget): void {
  win.fetch = createContentHashFetch({
    fetch: win.fetch.bind(win),
    location: win.location,
    subtle: win.crypto?.subtle,
  });
}
