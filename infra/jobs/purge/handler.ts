import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import postgres from "postgres";
import { parseCredentials, runPurge, type DbCredentials } from "./purge.js";

const secrets = new SecretsManagerClient({});

async function loadCredentials(): Promise<DbCredentials> {
  const secretId = process.env.EVZLA_DB_SECRET_JOB;
  if (!secretId) throw new Error("Falta EVZLA_DB_SECRET_JOB");
  const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  return parseCredentials(SecretString);
}

async function callPurge(c: DbCredentials): Promise<number> {
  // verify-full: la CA de RDS llega por NODE_EXTRA_CA_CERTS (/var/runtime/ca-cert.pem).
  const sql = postgres({
    host: c.host,
    port: c.port,
    database: c.dbname,
    username: c.username,
    password: c.password,
    ssl: "verify-full",
    max: 1,
    connect_timeout: 10,
  });
  try {
    const [row] = await sql<{ deleted: number }[]>`select public.purge_search_log() as deleted`;
    return row?.deleted ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export const handler = () =>
  runPurge({
    loadCredentials,
    callPurge,
    log: (entry) => console.log(JSON.stringify(entry)),
  });
