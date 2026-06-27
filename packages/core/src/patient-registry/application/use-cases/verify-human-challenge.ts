import type { HumanVerificationGateway } from "../ports/human-verification-gateway";

// Caso de uso: valida el reto anti-bot antes de permitir una búsqueda.
// Sin token no se molesta al proveedor: no hay humano que verificar.
export class VerifyHumanChallenge {
  constructor(private readonly gateway: HumanVerificationGateway) {}

  async execute(token: string, remoteIp?: string): Promise<boolean> {
    if (token.trim().length === 0) return false;
    return this.gateway.verify(token, remoteIp);
  }
}
