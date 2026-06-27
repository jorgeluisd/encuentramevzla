// Verificación de humanidad (anti-bot). La implementa un proveedor externo
// (Cloudflare Turnstile) en infraestructura. Devuelve true si el token es válido.
export interface HumanVerificationGateway {
  verify(token: string, remoteIp?: string): Promise<boolean>;
}
