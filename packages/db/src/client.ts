import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import * as schema from "./schema/index";

// Solo servidor. `public` solo puede ejecutar los RPC mediados; `admin` escribe public + sensitive.
export type DbRole = "admin" | "public" | "job";

export type ConnectionTarget =
  | { kind: "url"; url: string }
  | {
      kind: "options";
      options: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        ssl: { rejectUnauthorized: true; servername: string };
      };
    };

type Env = Record<string, string | undefined>;
type SecretFetcher = (secretId: string) => Promise<string>;

export async function resolveConnection(
  role: DbRole,
  env: Env,
  fetchSecret: SecretFetcher,
): Promise<ConnectionTarget> {
  const suffix = role.toUpperCase();
  const secretId = env[`EVZLA_DB_SECRET_${suffix}`];
  if (secretId) {
    return { kind: "options", options: parseDbSecret(await fetchSecret(secretId), role) };
  }
  const url = env[`DATABASE_URL_${suffix}`] ?? env.DATABASE_URL;
  if (url) return { kind: "url", url };
  throw new Error(`Falta EVZLA_DB_SECRET_${suffix} (AWS) o DATABASE_URL (dev) para el rol ${role}.`);
}

// El error nunca incluye el contenido del secreto.
function parseDbSecret(raw: string, role: DbRole) {
  let s: Record<string, unknown>;
  try {
    s = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`El secreto de base del rol ${role} no es JSON válido.`);
  }
  const port = Number(s.port ?? 5432);
  const fields = [s.host, s.dbname, s.username, s.password];
  if (fields.some((v) => typeof v !== "string" || v === "") || !Number.isInteger(port)) {
    throw new Error(`El secreto de base del rol ${role} está incompleto (host, port, dbname, username, password).`);
  }
  return {
    host: s.host as string,
    port,
    database: s.dbname as string,
    username: s.username as string,
    password: s.password as string,
    // verify-full: cadena contra el trust store de Node (incluye NODE_EXTRA_CA_CERTS de Lambda) + hostname.
    ssl: { rejectUnauthorized: true as const, servername: s.host as string },
  };
}

// Las credenciales llegan async (Secrets Manager) pero `getDb()` es sync en todo el código:
// el cliente real se crea en la primera query. Drizzle solo usa `options`, `unsafe` y `begin`.
export function createLazySql(create: () => Promise<postgres.Sql>): postgres.Sql {
  const options = { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown> };
  let pending: Promise<postgres.Sql> | null = null;

  const ready = (): Promise<postgres.Sql> => {
    pending ??= create().then(
      (sql) => {
        Object.assign(sql.options.parsers, options.parsers);
        Object.assign(sql.options.serializers, options.serializers);
        return sql;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };

  type Params = postgres.ParameterOrJSON<never>[];
  const lazy = {
    options,
    // Thenable perezoso: la query corre una sola vez, ya sea como filas o como `values()`.
    unsafe(query: string, params?: unknown[], queryOptions?: postgres.UnsafeQueryOptions) {
      return {
        then<T, R>(onFulfilled?: (rows: unknown) => T, onRejected?: (error: unknown) => R) {
          return ready()
            .then((sql) => sql.unsafe(query, params as Params, queryOptions))
            .then(onFulfilled, onRejected);
        },
        values: () => ready().then((sql) => sql.unsafe(query, params as Params, queryOptions).values()),
      };
    },
    begin(...args: unknown[]) {
      return ready().then((sql) => (sql.begin as (...a: unknown[]) => Promise<unknown>)(...args));
    },
    end(endOptions?: { timeout?: number }) {
      return pending ? pending.then((sql) => sql.end(endOptions)) : Promise.resolve();
    },
  };
  return lazy as unknown as postgres.Sql;
}

let secretsClient: SecretsManagerClient | null = null;

async function fetchSecretString(secretId: string): Promise<string> {
  secretsClient ??= new SecretsManagerClient({});
  const out = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error("Secreto de base sin SecretString.");
  return out.SecretString;
}

// Lambda atiende un request a la vez por contenedor: 1 conexión por rol no agota la RDS.
const POOL = { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 } as const;

async function connect(role: DbRole): Promise<postgres.Sql> {
  const target = await resolveConnection(role, process.env, fetchSecretString);
  return target.kind === "url" ? postgres(target.url, POOL) : postgres({ ...target.options, ...POOL });
}

const dbs = new Map<DbRole, ReturnType<typeof drizzle<typeof schema>>>();

export function getDb(role: DbRole) {
  let db = dbs.get(role);
  if (!db) {
    db = drizzle(createLazySql(() => connect(role)), { schema });
    dbs.set(role, db);
  }
  return db;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
