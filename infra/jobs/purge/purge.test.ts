import { describe, expect, it, vi } from "vitest";
import { parseCredentials, runPurge, type DbCredentials } from "./purge.js";

const credentials: DbCredentials = {
  host: "db.internal",
  port: 5432,
  dbname: "encuentramevzla",
  username: "evzla_job",
  password: "not-a-real-password",
};

describe("runPurge", () => {
  it("calls the purge function with the job credentials and returns the deleted count", async () => {
    const callPurge = vi.fn().mockResolvedValue(42);

    const result = await runPurge({
      loadCredentials: async () => credentials,
      callPurge,
      log: () => {},
    });

    expect(callPurge).toHaveBeenCalledWith(credentials);
    expect(result).toEqual({ deleted: 42 });
  });

  it("logs only the count, never credentials", async () => {
    const log = vi.fn();

    await runPurge({ loadCredentials: async () => credentials, callPurge: async () => 3, log });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({ event: "purge_search_log.done", deleted: 3 });
    expect(JSON.stringify(log.mock.calls)).not.toContain(credentials.password);
  });

  it("propagates database failures without logging", async () => {
    const log = vi.fn();

    await expect(
      runPurge({
        loadCredentials: async () => credentials,
        callPurge: async () => {
          throw new Error("connection refused");
        },
        log,
      }),
    ).rejects.toThrow("connection refused");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("parseCredentials", () => {
  it("parses the contract secret shape", () => {
    expect(parseCredentials(JSON.stringify({ ...credentials, port: "5432" }))).toEqual(credentials);
  });

  it("defaults the port to 5432", () => {
    const withoutPort: Partial<DbCredentials> = { ...credentials };
    delete withoutPort.port;
    expect(parseCredentials(JSON.stringify(withoutPort)).port).toBe(5432);
  });

  it("rejects empty or malformed secrets without echoing them", () => {
    expect(() => parseCredentials(undefined)).toThrow("Secreto de base vacío");
    const malformed = JSON.stringify({ host: "h", password: "s3cr3t" });
    expect(() => parseCredentials(malformed)).toThrow("Secreto de base con formato inválido");
    try {
      parseCredentials(malformed);
    } catch (e) {
      expect((e as Error).message).not.toContain("s3cr3t");
    }
  });
});
