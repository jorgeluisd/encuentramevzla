export type DbCredentials = {
  host: string;
  port: number;
  dbname: string;
  username: string;
  password: string;
};

export type PurgeDeps = {
  loadCredentials: () => Promise<DbCredentials>;
  callPurge: (credentials: DbCredentials) => Promise<number>;
  log: (entry: Record<string, unknown>) => void;
};

// Solo se registra el conteo: search_log no debe salir de la base.
export async function runPurge(deps: PurgeDeps): Promise<{ deleted: number }> {
  const credentials = await deps.loadCredentials();
  const deleted = await deps.callPurge(credentials);
  deps.log({ event: "purge_search_log.done", deleted });
  return { deleted };
}

export function parseCredentials(secretString: string | undefined): DbCredentials {
  if (!secretString) throw new Error("Secreto de base vacío");
  const raw = JSON.parse(secretString) as Partial<Record<keyof DbCredentials, unknown>>;
  const { host, port, dbname, username, password } = raw;
  if (
    typeof host !== "string" ||
    typeof dbname !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    throw new Error("Secreto de base con formato inválido");
  }
  const portNumber = Number(port ?? 5432);
  if (!Number.isInteger(portNumber)) throw new Error("Secreto de base con puerto inválido");
  return { host, port: portNumber, dbname, username, password };
}
