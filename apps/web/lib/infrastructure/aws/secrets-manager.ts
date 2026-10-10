import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

let client: SecretsManagerClient | null = null;

export async function fetchSecretString(secretId: string): Promise<string> {
  client ??= new SecretsManagerClient({});
  const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error("Secreto sin SecretString.");
  return out.SecretString;
}
