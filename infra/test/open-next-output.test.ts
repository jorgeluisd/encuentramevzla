import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOpenNextOutput } from "../lib/open-next-output.js";

const fixture = fileURLToPath(new URL("./fixtures/web", import.meta.url));
const OUTSIDE = "La salida de OpenNext apunta fuera de .open-next";

type Output = {
  origins: Record<string, { bundle?: string; copy?: { from: string; cached: boolean }[] }>;
  additionalProps: Record<string, { bundle: string }>;
};

describe("readOpenNextOutput", () => {
  let workDir: string;
  let openNextDir: string;
  let outside: string;

  const outputFile = (): string => path.join(openNextDir, "open-next.output.json");

  const editOutput = (edit: (output: Output) => void): void => {
    const output = JSON.parse(readFileSync(outputFile(), "utf8")) as Output;
    edit(output);
    writeFileSync(outputFile(), JSON.stringify(output));
  };

  const copyEntry = (output: Output, cached: boolean) => {
    const entry = output.origins.s3?.copy?.find((copy) => copy.cached === cached);
    if (!entry) throw new Error("fixture without the s3 copy entry");
    return entry;
  };

  const setBundle = (origin: string, bundle: string) => (output: Output) => {
    const entry = output.origins[origin];
    if (!entry) throw new Error(`fixture without origin ${origin}`);
    entry.bundle = bundle;
  };

  const setProp = (prop: string, bundle: string) => (output: Output) => {
    output.additionalProps[prop] = { ...output.additionalProps[prop], bundle };
  };

  const expectRejected = (field: string): void => {
    let message = "";
    try {
      readOpenNextOutput(openNextDir);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(`${OUTSIDE} (${field}).`);
    expect(message).not.toContain(workDir);
  };

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "evzla-open-next-output-"));
    cpSync(fixture, path.join(workDir, "web"), { recursive: true });
    openNextDir = path.join(workDir, "web/.open-next");
    outside = path.join(workDir, "outside");
    mkdirSync(outside);
    writeFileSync(path.join(outside, "dynamodb-cache.json"), "[]");
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("resolves every bundle and copy source of the fixture inside .open-next", () => {
    const output = readOpenNextOutput(openNextDir);
    expect(output.server.dir).toBe(path.join(openNextDir, "server-functions/default"));
    expect(output.assetsDir).toBe(path.join(openNextDir, "assets"));
    expect(output.cacheDir).toBe(path.join(openNextDir, "cache"));
    expect(output.initialization?.cacheFile).toBe(path.join(openNextDir, "dynamodb-provider/dynamodb-cache.json"));
  });

  it.each([
    ["the server bundle with ../..", setBundle("default", "../../outside"), "origins.default.bundle"],
    ["the image bundle as an absolute path", setBundle("imageOptimizer", "/etc"), "origins.imageOptimizer.bundle"],
    [
      "the revalidation bundle through .open-next/..",
      setProp("revalidationFunction", ".open-next/../outside"),
      "additionalProps.revalidationFunction.bundle",
    ],
    [
      "the initialization bundle with ..",
      setProp("initializationFunction", "../outside"),
      "additionalProps.initializationFunction.bundle",
    ],
    ["assets.from as an absolute path", (output: Output) => (copyEntry(output, true).from = "/etc"), "origins.s3.copy (assets)"],
    [
      "cache.from with ../..",
      (output: Output) => (copyEntry(output, false).from = ".open-next/../../.."),
      "origins.s3.copy (cache)",
    ],
    [
      "assets.from as .open-next itself",
      (output: Output) => (copyEntry(output, true).from = ".open-next"),
      "origins.s3.copy (assets)",
    ],
  ])("rejects %s naming the field, without printing the path", (_label, edit, field) => {
    editOutput(edit);
    expectRejected(field);
  });

  it("rejects a path that leaves .open-next through a symlink, even when the rest of it does not exist", () => {
    rmSync(path.join(openNextDir, "assets"), { recursive: true });
    symlinkSync(outside, path.join(openNextDir, "assets"));
    expectRejected("origins.s3.copy (assets)");

    rmSync(path.join(openNextDir, "assets"));
    mkdirSync(path.join(openNextDir, "assets"));
    symlinkSync(outside, path.join(openNextDir, "escape"));
    editOutput(setBundle("default", ".open-next/escape/missing/default"));
    expectRejected("origins.default.bundle");
  });

  it("rejects a dangling symlink, whose target cannot be confined", () => {
    symlinkSync(path.join(outside, "not-yet"), path.join(openNextDir, "later"));
    editOutput((output) => (copyEntry(output, false).from = ".open-next/later"));
    expectRejected("origins.s3.copy (cache)");
  });

  it("rejects an initialization cache file that is a symlink out of .open-next", () => {
    const cacheFile = path.join(openNextDir, "dynamodb-provider/dynamodb-cache.json");
    rmSync(cacheFile);
    symlinkSync(path.join(outside, "dynamodb-cache.json"), cacheFile);
    expectRejected("dynamodb-cache.json");
  });

  it("accepts symlinks that stay inside .open-next and an .open-next reached through a symlink", () => {
    symlinkSync("assets", path.join(openNextDir, "assets-alias"));
    editOutput((output) => (copyEntry(output, true).from = ".open-next/assets-alias"));
    expect(readOpenNextOutput(openNextDir).assetsDir).toBe(path.join(openNextDir, "assets-alias"));

    const linkedWeb = path.join(workDir, "linked-web");
    symlinkSync(path.join(workDir, "web"), linkedWeb);
    expect(() => readOpenNextOutput(path.join(linkedWeb, ".open-next"))).not.toThrow();
  });
});
