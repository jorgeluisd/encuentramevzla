import { CognitoJwtVerifier } from "aws-jwt-verify";

// Verifica firma (JWKS del pool, cacheado por contenedor), emisor, audiencia y vencimiento.
// Cualquier token inválido es "sin sesión": nunca lanza.
export function createIdTokenVerifier(
  userPoolId: string,
  clientId: string,
): (idToken: string) => Promise<string | null> {
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
  return async (idToken) => {
    try {
      const payload = await verifier.verify(idToken);
      return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    } catch {
      return null;
    }
  };
}
