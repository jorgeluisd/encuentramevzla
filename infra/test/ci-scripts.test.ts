import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const scriptsDir = fileURLToPath(new URL("../scripts/ci/", import.meta.url));

// La config global del desarrollador (firma de tags, hooks) no debe alterar los repos sintéticos.
const isolatedGitEnv = { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

type ScriptRun ={ status: number | null; stdout: string; stderr: string; output: string };

function runScript(script: string, cwd: string, env: Record<string, string>, args: string[] = []): ScriptRun {
  const outputDir = mkdtempSync(path.join(tmpdir(), "evzla-ci-out-"));
  const outputFile = path.join(outputDir, "github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...isolatedGitEnv, GITHUB_OUTPUT: outputFile, ...env },
    timeout: 30_000,
  });
  const output = readFileSync(outputFile, "utf8");
  rmSync(outputDir, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output };
}

describe("resolve-ref.mjs", () => {
  let repo: string;
  let mainHead: string;
  let mainFirst: string;
  let sideCommit: string;

  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=ci-test", "-c", "user.email=ci-test@example.com", ...args], {
      cwd: repo,
      encoding: "utf8",
      env: isolatedGitEnv,
    }).trim();

  const commit = (message: string): string => {
    git("commit", "--allow-empty", "--no-gpg-sign", "-m", message);
    return git("rev-parse", "HEAD");
  };

  const resolve = (env: Record<string, string>): ScriptRun =>
    runScript("resolve-ref.mjs", repo, { GITHUB_SHA: mainHead, ...env });

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "evzla-resolve-ref-"));
    git("init", "--quiet", "--initial-branch=main");
    mainFirst = commit("first");
    git("tag", "-a", "--no-sign", "v1.0.0", "-m", "release", mainFirst);
    mainHead = commit("second");
    git("update-ref", "refs/remotes/origin/main", mainHead);
    git("switch", "--quiet", "-c", "side", mainFirst);
    sideCommit = commit("side");
    git("tag", "side-tag", sideCommit);
    git("switch", "--quiet", "main");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("uses GITHUB_SHA when the event is not workflow_dispatch, ignoring INPUT_REF", () => {
    const run = resolve({ EVENT_NAME: "push", INPUT_REF: mainFirst });
    expect(run.status).toBe(0);
    expect(run.output).toBe(`sha=${mainHead}\n`);
  });

  it("uses GITHUB_SHA on workflow_dispatch with an empty ref", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: "  ", GITHUB_SHA: mainFirst });
    expect(run.status).toBe(0);
    expect(run.output).toBe(`sha=${mainFirst}\n`);
  });

  it("accepts a 40-hex SHA that is an ancestor of origin/main", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: mainFirst });
    expect(run.status).toBe(0);
    expect(run.output).toBe(`sha=${mainFirst}\n`);
  });

  it("rejects a SHA that is not an ancestor of origin/main", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: sideCommit });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no es ancestro de origin/main");
    expect(run.output).toBe("");
  });

  it("resolves an existing annotated tag to its commit SHA", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: "v1.0.0" });
    expect(run.status).toBe(0);
    expect(run.output).toBe(`sha=${mainFirst}\n`);
  });

  it("rejects an existing tag whose commit is not an ancestor of origin/main", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: "side-tag" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no es ancestro de origin/main");
    expect(run.output).toBe("");
  });

  it("rejects a tag that does not exist", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: "v9.9.9" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no existe");
    expect(run.output).toBe("");
  });

  it("rejects a well-formed 40-hex SHA that is not in the repository", () => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: "0".repeat(40) });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no existe");
    expect(run.output).toBe("");
  });

  it.each([
    ["garbage with shell metacharacters", "main; touch pwned"],
    ["a value starting with '-' that git would read as an option", "--upload-pack=touch pwned"],
    ["a workflow command injection attempt", "::set-output name=sha::evil"],
  ])("rejects %s without echoing the value", (_label, ref) => {
    const run = resolve({ EVENT_NAME: "workflow_dispatch", INPUT_REF: ref });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("ref inválido");
    expect(run.stderr + run.stdout).not.toContain(ref);
    expect(run.output).toBe("");
  });

  it("fails closed when GITHUB_SHA is not a 40-hex SHA", () => {
    const run = resolve({ EVENT_NAME: "push", GITHUB_SHA: "not-a-sha" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("GITHUB_SHA inválido");
    expect(run.output).toBe("");
  });
});

describe("check-public-env.mjs", () => {
  let dir: string;

  const check = (contents: string): ScriptRun => {
    const envFile = path.join(dir, ".env.production");
    writeFileSync(envFile, contents);
    return runScript("check-public-env.mjs", dir, {}, [envFile]);
  };

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "evzla-public-env-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes with only NEXT_PUBLIC_ keys, comments and blank lines", () => {
    const run = check("# comentario\n\nNEXT_PUBLIC_SITE_KEY=synthetic-site-key\n  \nexport NEXT_PUBLIC_FLAG=1\n");
    expect(run.status).toBe(0);
  });

  it("fails on a key without the NEXT_PUBLIC_ prefix, printing only line number and key", () => {
    const run = check("NEXT_PUBLIC_SITE_KEY=synthetic-site-key\nDATABASE_URL=postgres://synthetic-secret-value\n");
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("check-public-env: línea 2: clave DATABASE_URL sin prefijo NEXT_PUBLIC_\n");
    expect(run.stderr + run.stdout).not.toContain("synthetic-secret-value");
    expect(run.stderr + run.stdout).not.toContain("synthetic-site-key");
  });

  it("fails on an exported key without the prefix and reports every offending line", () => {
    const run = check("export FOO=synthetic-secret-value\nNEXT_PUBLIC_OK=1\nBAR=synthetic-secret-value\n");
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      "check-public-env: línea 1: clave FOO sin prefijo NEXT_PUBLIC_\n" +
        "check-public-env: línea 3: clave BAR sin prefijo NEXT_PUBLIC_\n",
    );
    expect(run.stderr + run.stdout).not.toContain("synthetic-secret-value");
  });

  it("fails on a line that is not a KEY=value assignment without echoing its content", () => {
    const run = check("NEXT_PUBLIC_OK=1\nsynthetic-pasted-secret\n");
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("check-public-env: línea 2: no es una asignación CLAVE=valor\n");
    expect(run.stderr + run.stdout).not.toContain("synthetic-pasted-secret");
  });

  it("fails closed when the file path is missing or unreadable", () => {
    const missingArg = runScript("check-public-env.mjs", dir, {});
    expect(missingArg.status).toBe(1);
    expect(missingArg.stderr).toBe("check-public-env: falta la ruta del archivo\n");

    const unreadable = runScript("check-public-env.mjs", dir, {}, [path.join(dir, "does-not-exist")]);
    expect(unreadable.status).toBe(1);
    expect(unreadable.stderr).toBe("check-public-env: no se pudo leer el archivo\n");
  });
});

describe("check-bundle.mjs", () => {
  let workDir: string;
  let bundle: string;

  // Los patrones de secreto se arman en runtime para que el repo no contenga literales que los imiten.
  const syntheticAccessKeyId = ["AK", "IA"].join("") + "TESTONLY" + "0".repeat(8);
  const syntheticPemHeader = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");

  const write = (relativePath: string, contents: string): void => {
    const file = path.join(bundle, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  };

  const link = (relativePath: string, target: string): void => {
    const file = path.join(bundle, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    symlinkSync(target, file);
  };

  const check = (args: string[] = [bundle]): ScriptRun => runScript("check-bundle.mjs", workDir, {}, args);

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "evzla-check-bundle-"));
    bundle = path.join(workDir, ".open-next");
    mkdirSync(bundle);
    write("open-next.output.json", '{"edgeFunctions":{}}');
    write("server-functions/default/index.mjs", 'export const siteKey = "NEXT_PUBLIC_SITE_KEY:synthetic-public";\n');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("passes on a clean bundle with open-next.output.json", () => {
    const run = check();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("fails when open-next.output.json is missing (AC-23)", () => {
    rmSync(path.join(bundle, "open-next.output.json"));
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("check-bundle: falta open-next.output.json\n");
  });

  it.each([".env", ".env.local", "x.pem", "x.key"])("fails on a forbidden file name %s listing only its path", (name) => {
    write(`server-functions/default/${name}`, "synthetic-secret-value");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`check-bundle: "server-functions/default/${name}": nombre de archivo prohibido\n`);
    expect(run.stderr + run.stdout).not.toContain("synthetic-secret-value");
  });

  it.each([
    ["an AWS access key id", () => `const k = "${syntheticAccessKeyId}";`],
    ["a private key PEM header", () => `${syntheticPemHeader}\nsynthetic-body\n`],
  ])("fails on content with %s, listing only the path", (_label, contents) => {
    const secret = contents();
    write("assets/chunk.js", secret);
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "assets/chunk.js": contenido con patrón de secreto\n');
    expect(run.stderr + run.stdout).not.toContain(secret.split("\n")[0] ?? secret);
  });

  it("fails on a symlink pointing outside the bundle by absolute path or by ../..", () => {
    link("server-functions/default/host", "/etc/hostname");
    link("server-functions/up", "../..");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'check-bundle: "server-functions/default/host": symlink fuera del bundle\n' +
        'check-bundle: "server-functions/up": symlink fuera del bundle\n',
    );
  });

  it("does not flag the SDK property access to the secret key field, only an assigned value", () => {
    const field = ["aws", "secret", "access", "key"].join("_");
    write("server-functions/default/sdk.js", `secretAccessKey: profile.${field}, ok: typeof e.${field}=="string"`);
    expect(check().status).toBe(0);

    const assigned = `${field} = ${"Q".repeat(40)}`;
    write("assets/config.ini", `[default]\n${assigned}\n`);
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "assets/config.ini": contenido con patrón de secreto\n');
    expect(run.stderr + run.stdout).not.toContain("Q".repeat(40));
  });

  it("fails on a symlink to a sibling directory that only shares the bundle name prefix", () => {
    mkdirSync(path.join(workDir, ".open-next-evil"));
    link("server-functions/sibling", "../../.open-next-evil");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "server-functions/sibling": symlink fuera del bundle\n');
  });

  it("does not descend into an internal symlink loop", () => {
    link("server-functions/default/loop", ".");
    const run = check();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("fails on a symlink with a forbidden name even if it points inside", () => {
    link("server-functions/default/.env", "index.mjs");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "server-functions/default/.env": nombre de archivo prohibido\n');
  });

  it("reports every violation, matching forbidden extensions case-insensitively, with nothing on stdout", () => {
    write("a/b/c/CERT.PEM", "x");
    write("assets/z.js", `"${syntheticAccessKeyId}"`);
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'check-bundle: "a/b/c/CERT.PEM": nombre de archivo prohibido\n' +
        'check-bundle: "assets/z.js": contenido con patrón de secreto\n',
    );
    expect(run.stdout).toBe("");
  });

  it("escapes paths so a hostile file name cannot start a workflow command line", () => {
    write("assets/evil\n::warning::x.pem", "x");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "assets/evil\\n::warning::x.pem": nombre de archivo prohibido\n');
    expect(run.stderr.split("\n").some((line) => line.startsWith("::"))).toBe(false);
  });

  it("fails on an entry that is neither a regular file, a directory nor a symlink, without blocking on it", () => {
    execFileSync("mkfifo", [path.join(bundle, "assets-pipe")]);
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "assets-pipe": tipo de archivo no permitido\n');
  });

  it("fails when open-next.output.json is not a regular file", () => {
    rmSync(path.join(bundle, "open-next.output.json"));
    mkdirSync(path.join(bundle, "open-next.output.json"));
    expect(check().stderr).toBe("check-bundle: falta open-next.output.json\n");

    rmSync(path.join(bundle, "open-next.output.json"), { recursive: true });
    write("real-output.json", "{}");
    link("open-next.output.json", "real-output.json");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("check-bundle: falta open-next.output.json\n");
  });

  it("fails closed when the bundle path is missing, does not exist, is a file or is a symlink", () => {
    const missing = check([]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toBe("check-bundle: falta la ruta del bundle\n");

    const absent = check([path.join(workDir, "nope")]);
    expect(absent.status).toBe(1);
    expect(absent.stderr).toBe("check-bundle: el bundle no existe\n");

    const file = path.join(workDir, "plain-file");
    writeFileSync(file, "x");
    const notDir = check([file]);
    expect(notDir.status).toBe(1);
    expect(notDir.stderr).toBe("check-bundle: la raíz del bundle no es un directorio\n");

    const rootLink = path.join(workDir, "linked-bundle");
    symlinkSync(bundle, rootLink);
    const linked = check([rootLink]);
    expect(linked.status).toBe(1);
    expect(linked.stderr).toBe("check-bundle: la raíz del bundle no es un directorio\n");
  });

  describe("--tar-entries", () => {
    const checkEntries = (listing: string): ScriptRun => {
      const listFile = path.join(workDir, "entries.txt");
      writeFileSync(listFile, listing);
      return check(["--tar-entries", listFile]);
    };

    it("passes when every entry is under .open-next/", () => {
      const run = checkEntries(".open-next/\n.open-next/open-next.output.json\n.open-next/server-functions/default/index.mjs\n");
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    });

    it("rejects absolute paths, .. segments and entries outside .open-next/, by line number only", () => {
      const run = checkEntries(
        [
          ".open-next/ok.js",
          "/etc/passwd",
          ".open-next/../outside",
          "other/file",
          "./.open-next/x",
          "..",
          ".open-next-evil/x",
          ".open-next/a/../../b",
        ].join("\n") + "\n",
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        [2, 3, 4, 5, 6, 7, 8].map((line) => `check-bundle: entrada ${line} del tar fuera de .open-next/\n`).join(""),
      );
      expect(run.stderr).not.toContain("passwd");
    });

    it("fails closed on an empty listing or an unreadable listing file", () => {
      const empty = checkEntries("\n");
      expect(empty.status).toBe(1);
      expect(empty.stderr).toBe("check-bundle: el tar no tiene entradas\n");

      const unreadable = check(["--tar-entries", path.join(workDir, "missing.txt")]);
      expect(unreadable.status).toBe(1);
      expect(unreadable.stderr).toBe("check-bundle: no se pudo leer la lista de entradas del tar\n");

      const noFile = check(["--tar-entries"]);
      expect(noFile.status).toBe(1);
      expect(noFile.stderr).toBe("check-bundle: falta la ruta de la lista de entradas del tar\n");
    });
  });

  it("passes with an internal pnpm-style relative symlink", () => {
    write("server-functions/default/node_modules/.pnpm/next@1.0.0/node_modules/next/index.js", "export {};\n");
    link("server-functions/default/node_modules/next", ".pnpm/next@1.0.0/node_modules/next");
    const run = check();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});
