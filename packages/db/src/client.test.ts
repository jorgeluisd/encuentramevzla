import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createLazySql, resolveConnection } from "./client";

// Valor ficticio armado en runtime (no es una credencial).
const FAKE_PW = ["fake", "value", "for", "tests"].join("-");

const secretJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    host: "db.internal",
    port: 5432,
    dbname: "encuentramevzla",
    username: "evzla_admin",
    password: FAKE_PW,
    ...over,
  });

function recordingFetcher(values: Record<string, string>) {
  const calls: string[] = [];
  const fetchSecret = async (id: string): Promise<string> => {
    calls.push(id);
    const v = values[id];
    if (v === undefined) throw new Error("not found");
    return v;
  };
  return { calls, fetchSecret };
}

describe("resolveConnection", () => {
  it("lee las credenciales del secreto del rol con TLS verify-full (CA del runtime vía NODE_EXTRA_CA_CERTS)", async () => {
    const { fetchSecret, calls } = recordingFetcher({ "evzla/db/admin": secretJson() });
    const target = await resolveConnection(
      "admin",
      { EVZLA_DB_SECRET_ADMIN: "evzla/db/admin", DATABASE_URL: "postgres://localhost/ignored" },
      fetchSecret,
    );
    expect(calls).toEqual(["evzla/db/admin"]);
    expect(target).toEqual({
      kind: "options",
      options: {
        host: "db.internal",
        port: 5432,
        database: "encuentramevzla",
        username: "evzla_admin",
        password: FAKE_PW,
        ssl: { rejectUnauthorized: true, servername: "db.internal" },
      },
    });
  });

  it("cada rol usa su propio secreto (public no hereda el de admin)", async () => {
    const { fetchSecret, calls } = recordingFetcher({
      "evzla/db/public": secretJson({ username: "evzla_public" }),
    });
    const target = await resolveConnection(
      "public",
      { EVZLA_DB_SECRET_ADMIN: "evzla/db/admin", EVZLA_DB_SECRET_PUBLIC: "evzla/db/public" },
      fetchSecret,
    );
    expect(calls).toEqual(["evzla/db/public"]);
    expect(target.kind === "options" && target.options.username).toBe("evzla_public");
  });

  it("el rol job usa EVZLA_DB_SECRET_JOB", async () => {
    const { fetchSecret, calls } = recordingFetcher({ "evzla/db/job": secretJson() });
    await resolveConnection("job", { EVZLA_DB_SECRET_JOB: "evzla/db/job" }, fetchSecret);
    expect(calls).toEqual(["evzla/db/job"]);
  });

  it("sin secreto del rol usa DATABASE_URL (dev local) sin tocar Secrets Manager", async () => {
    const { fetchSecret, calls } = recordingFetcher({});
    const target = await resolveConnection(
      "public",
      { EVZLA_DB_SECRET_ADMIN: "evzla/db/admin", DATABASE_URL: "postgres://localhost/db" },
      fetchSecret,
    );
    expect(calls).toEqual([]);
    expect(target).toEqual({ kind: "url", url: "postgres://localhost/db" });
  });

  it("DATABASE_URL_<ROL> tiene prioridad sobre DATABASE_URL en dev", async () => {
    const { fetchSecret } = recordingFetcher({});
    const target = await resolveConnection(
      "public",
      { DATABASE_URL: "postgres://localhost/admin", DATABASE_URL_PUBLIC: "postgres://localhost/public" },
      fetchSecret,
    );
    expect(target).toEqual({ kind: "url", url: "postgres://localhost/public" });
  });

  it("falla con un mensaje sin credenciales si no hay ninguna configuración", async () => {
    const { fetchSecret } = recordingFetcher({});
    await expect(resolveConnection("admin", {}, fetchSecret)).rejects.toThrow(
      /EVZLA_DB_SECRET_ADMIN.*DATABASE_URL/,
    );
  });

  it("rechaza un secreto incompleto sin incluir su contenido en el error", async () => {
    const { fetchSecret } = recordingFetcher({
      "evzla/db/admin": JSON.stringify({ host: "h", password: FAKE_PW }),
    });
    const error = await resolveConnection(
      "admin",
      { EVZLA_DB_SECRET_ADMIN: "evzla/db/admin" },
      fetchSecret,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(FAKE_PW);
  });
});

// Fake mínimo de postgres.Sql: lo que Drizzle usa del cliente (options, unsafe, begin).
function fakeSql(log: string[]) {
  return {
    options: { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown> },
    unsafe(query: string, params?: unknown[]) {
      log.push(`unsafe:${query}:${JSON.stringify(params ?? [])}`);
      return Object.assign(Promise.resolve([{ ok: 1 }]), {
        values: async () => {
          log.push("values");
          return [[1]];
        },
      });
    },
    async begin(fn: (tx: unknown) => Promise<unknown>) {
      log.push("begin");
      return fn("tx");
    },
  } as unknown as postgres.Sql;
}

describe("createLazySql", () => {
  it("no conecta hasta la primera query y crea el cliente una sola vez", async () => {
    const log: string[] = [];
    let created = 0;
    const lazy = createLazySql(async () => {
      created += 1;
      return fakeSql(log);
    });
    expect(created).toBe(0);
    await lazy.unsafe("select 1", []);
    await lazy.unsafe("select 2", [1]);
    expect(created).toBe(1);
    expect(log).toEqual(["unsafe:select 1:[]", "unsafe:select 2:[1]"]);
  });

  it("delega values() y begin() al cliente real", async () => {
    const log: string[] = [];
    const lazy = createLazySql(async () => fakeSql(log));
    expect(await lazy.unsafe("select 1", []).values()).toEqual([[1]]);
    expect(await lazy.begin(async (tx) => tx)).toBe("tx");
    expect(log).toEqual(["unsafe:select 1:[]", "values", "begin"]);
  });

  it("copia al cliente real los parsers/serializers que registra Drizzle", async () => {
    const real = fakeSql([]);
    const lazy = createLazySql(async () => real);
    const parser = (v: unknown) => v;
    lazy.options.parsers["1184"] = parser;
    lazy.options.serializers["114"] = parser;
    await lazy.unsafe("select 1", []);
    expect(real.options.parsers["1184"]).toBe(parser);
    expect(real.options.serializers["114"]).toBe(parser);
  });

  it("si crear el cliente falla, el siguiente intento vuelve a probar", async () => {
    let attempt = 0;
    const lazy = createLazySql(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("secrets down");
      return fakeSql([]);
    });
    await expect(lazy.unsafe("select 1", [])).rejects.toThrow("secrets down");
    await expect(lazy.unsafe("select 1", [])).resolves.toEqual([{ ok: 1 }]);
    expect(attempt).toBe(2);
  });
});
