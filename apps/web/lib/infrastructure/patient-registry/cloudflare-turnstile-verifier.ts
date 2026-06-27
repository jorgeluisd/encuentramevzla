import type { HumanVerificationGateway } from "@evzla/core";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success?: boolean;
}

// Adapter de Cloudflare Turnstile: valida el token del widget contra siteverify.
export class CloudflareTurnstileVerifier implements HumanVerificationGateway {
  constructor(private readonly secretKey: string) {}

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    const body = new URLSearchParams({ secret: this.secretKey, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    try {
      const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
      const data = (await res.json()) as SiteverifyResponse;
      return data.success === true;
    } catch (error) {
      // Falla cerrada: si no se puede verificar, no se considera humano.
      console.error("[turnstile] verify error:", error);
      return false;
    }
  }
}
