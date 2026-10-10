import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoEmailOtp } from "@/lib/infrastructure/auth/cognito-email-otp";
import { createIdTokenVerifier } from "@/lib/infrastructure/auth/cognito-id-token-verifier";

// Sin "server-only" a propósito: también lo usa proxy.ts. Nunca importar desde un componente cliente.

export function requiredAuthEnv(name: "COGNITO_USER_POOL_ID" | "COGNITO_CLIENT_ID"): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno del servidor.`);
  return value;
}

let client: CognitoIdentityProviderClient | null = null;
export function cognitoClient(): CognitoIdentityProviderClient {
  client ??= new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
  return client;
}

export function cognitoEmailOtp(): CognitoEmailOtp {
  return new CognitoEmailOtp(cognitoClient(), requiredAuthEnv("COGNITO_CLIENT_ID"));
}

// Singleton: el verifier cachea el JWKS del pool por contenedor.
let verifier: ((idToken: string) => Promise<string | null>) | null = null;
export function verifyIdToken(idToken: string): Promise<string | null> {
  verifier ??= createIdTokenVerifier(
    requiredAuthEnv("COGNITO_USER_POOL_ID"),
    requiredAuthEnv("COGNITO_CLIENT_ID"),
  );
  return verifier(idToken);
}
