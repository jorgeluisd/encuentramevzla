import { execFileSync, spawn, spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
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

describe("check-main-tip.mjs", () => {
  const STALE_MESSAGE = "el SHA aprobado ya no es la punta de origin/main";
  let root: string;
  let clone: string;
  let approvedSha: string;
  let newerSha: string;

  const gitIn = (cwd: string, ...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=ci-test", "-c", "user.email=ci-test@example.com", ...args], {
      cwd,
      encoding: "utf8",
      env: isolatedGitEnv,
    }).trim();

  let shallowClone: string;

  const checkTip = (env: Record<string, string>): ScriptRun => runScript("check-main-tip.mjs", clone, env);

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "evzla-main-tip-"));
    const origin = path.join(root, "origin.git");
    const author = path.join(root, "author");
    clone = path.join(root, "clone");
    gitIn(root, "init", "--quiet", "--bare", "--initial-branch=main", origin);
    gitIn(root, "init", "--quiet", "--initial-branch=main", author);
    gitIn(author, "commit", "--allow-empty", "--no-gpg-sign", "-m", "approved");
    approvedSha = gitIn(author, "rev-parse", "HEAD");
    gitIn(author, "push", "--quiet", origin, "main");
    gitIn(root, "clone", "--quiet", `file://${origin}`, clone);
    shallowClone = path.join(root, "shallow");
    gitIn(root, "clone", "--quiet", "--depth=1", `file://${origin}`, shallowClone);
    gitIn(author, "commit", "--allow-empty", "--no-gpg-sign", "-m", "newer");
    newerSha = gitIn(author, "rev-parse", "HEAD");
    gitIn(author, "push", "--quiet", origin, "main");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("passes when the approved sha is the tip of origin/main fetched right now", () => {
    const run = checkTip({ EXPECTED_SHA: newerSha });
    expect(run.status).toBe(0);
  });

  it("fails with a fixed message, echoing no sha, when main moved past the approved sha", () => {
    const run = checkTip({ EXPECTED_SHA: approvedSha });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(STALE_MESSAGE);
    expect(run.stderr + run.stdout).not.toContain(approvedSha);
    expect(run.stderr + run.stdout).not.toContain(newerSha);
  });

  it.each([
    ["passes", () => newerSha, 0],
    ["fails", () => approvedSha, 1],
  ])("on a shallow checkout like the CI one, %s against the freshly fetched tip", (_label, sha, status) => {
    const run = runScript("check-main-tip.mjs", shallowClone, { EXPECTED_SHA: sha() });
    expect(run.status).toBe(status);
  });

  it.each([
    ["missing", {}],
    ["not a 40-hex sha", { EXPECTED_SHA: "main; touch pwned" }],
  ])("fails closed when EXPECTED_SHA is %s, without echoing it", (_label, env: Record<string, string>) => {
    const run = checkTip(env);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("EXPECTED_SHA inválido");
    expect(run.stderr + run.stdout).not.toContain("pwned");
  });

  it("fails closed when origin cannot be fetched", () => {
    const offline = mkdtempSync(path.join(tmpdir(), "evzla-main-tip-offline-"));
    gitIn(offline, "init", "--quiet", "--initial-branch=main");
    gitIn(offline, "remote", "add", "origin", `file://${path.join(offline, "missing.git")}`);
    const run = runScript("check-main-tip.mjs", offline, { EXPECTED_SHA: newerSha });
    rmSync(offline, { recursive: true, force: true });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no se pudo leer la punta de origin/main");
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
    writeFileSync(path.join(workDir, "outside.txt"), "x");
    link("server-functions/default/host", path.join(workDir, "outside.txt"));
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

  it("fails on a symlink that escapes through another internal symlink, judged by its real target", () => {
    link("a/up", "..");
    link("a/out", "up/..");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('check-bundle: "a/out": symlink fuera del bundle\n');
  });

  it("fails on every link of a chain whose last hop leaves the bundle", () => {
    writeFileSync(path.join(workDir, "outside.txt"), "x");
    link("server-functions/first", "second");
    link("server-functions/second", "../../outside.txt");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'check-bundle: "server-functions/first": symlink fuera del bundle\n' +
        'check-bundle: "server-functions/second": symlink fuera del bundle\n',
    );
  });

  it("fails closed on a dangling symlink and on a symlink cycle, even inside the bundle", () => {
    link("server-functions/default/ghost", "missing.js");
    link("server-functions/ping", "pong");
    link("server-functions/pong", "ping");
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'check-bundle: "server-functions/default/ghost": symlink colgante o en ciclo\n' +
        'check-bundle: "server-functions/ping": symlink colgante o en ciclo\n' +
        'check-bundle: "server-functions/pong": symlink colgante o en ciclo\n',
    );
  });

  it("fails on hardlinked files, inside the bundle or shared with a file outside it", () => {
    mkdirSync(path.join(bundle, "assets"));
    linkSync(path.join(bundle, "server-functions/default/index.mjs"), path.join(bundle, "assets/copy.mjs"));
    writeFileSync(path.join(workDir, "outside.txt"), "x");
    linkSync(path.join(workDir, "outside.txt"), path.join(bundle, "server-functions/out.txt"));
    const run = check();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'check-bundle: "assets/copy.mjs": hardlink no permitido\n' +
        'check-bundle: "server-functions/default/index.mjs": hardlink no permitido\n' +
        'check-bundle: "server-functions/out.txt": hardlink no permitido\n',
    );
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

  describe("--tar-archive", () => {
    type TarMember = { name: string; type?: string; linkname?: string; body?: string };

    const tarHeader = (name: string, type: string, size: number, linkname: string): Buffer => {
      const header = Buffer.alloc(512);
      header.write(name, 0, 100, "utf8");
      header.write("0000644\0", 100);
      header.write("0000000\0", 108);
      header.write("0000000\0", 116);
      header.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
      header.write("00000000000\0", 136);
      header.write(" ".repeat(8), 148);
      header.write(type, 156);
      header.write(linkname, 157, 100, "utf8");
      header.write("ustar\0", 257);
      header.write("00", 263);
      const checksum = header.reduce((sum, byte) => sum + byte, 0);
      header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
      return header;
    };

    const member = ({ name, type = "0", linkname = "", body = "" }: TarMember): Buffer => {
      const data = Buffer.from(body);
      const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
      return Buffer.concat([tarHeader(name, type, data.length, linkname), data, padding]);
    };

    const gnuLong = (type: "L" | "K", value: string): Buffer =>
      member({ name: "././@LongLink", type, body: `${value}\0` });

    const paxRecord = (key: string, value: string): string => {
      const rest = ` ${key}=${value}\n`;
      let length = rest.length;
      while (`${length}${rest}`.length !== length) length = `${length}${rest}`.length;
      return `${length}${rest}`;
    };

    const pax = (records: Record<string, string>): Buffer =>
      member({
        name: "PaxHeader",
        type: "x",
        body: Object.entries(records)
          .map(([key, value]) => paxRecord(key, value))
          .join(""),
      });

    const END_OF_ARCHIVE = Buffer.alloc(1024);

    const writeArchive = (members: Buffer[], end: Buffer = END_OF_ARCHIVE): string => {
      const archive = path.join(workDir, "open-next.tgz");
      writeFileSync(archive, gzipSync(Buffer.concat([...members, end])));
      return archive;
    };

    const checkArchive = (members: Buffer[]): ScriptRun => check(["--tar-archive", writeArchive(members)]);

    const systemTar = (): string => {
      const archive = path.join(workDir, "system.tgz");
      execFileSync("tar", ["-C", workDir, "-czf", archive, ".open-next"], {
        env: { PATH: process.env.PATH ?? "", COPYFILE_DISABLE: "1" },
      });
      return archive;
    };

    const directory = (name: string): Buffer => member({ name, type: "5" });
    const file = (name: string): Buffer => member({ name, body: "export {};\n" });
    const symlink = (name: string, linkname: string): Buffer => member({ name, type: "2", linkname });

    it("passes on the system tar of a bundle with pnpm-style relative symlinks", () => {
      write("server-functions/default/node_modules/.pnpm/next@1.0.0/node_modules/next/index.js", "export {};\n");
      link("server-functions/default/node_modules/next", ".pnpm/next@1.0.0/node_modules/next");
      link("server-functions/default/node_modules/.pnpm/next@1.0.0/node_modules/dep", "../../dep@2.0.0/node_modules/dep");
      write("server-functions/default/node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js", "export {};\n");
      const run = check(["--tar-archive", systemTar()]);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    });

    it("reads long names and names with ' -> ' or ' link to ' from the system tar, judging the real link target", () => {
      write(`${"n".repeat(70)}/${"m".repeat(70)}/a -> b link to c.js`, "export {};\n");
      link("server-functions/arrow -> x", "default/index.mjs");
      expect(check(["--tar-archive", systemTar()]).status).toBe(0);

      link("server-functions/evil -> default/index.mjs", "../../../outside");
      const run = check(["--tar-archive", systemTar()]);
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/^check-bundle: entrada \d+ del tar: symlink fuera de \.open-next\/\n$/);
    });

    it("rejects the hardlink entry that the system tar writes for a hardlinked file", () => {
      linkSync(path.join(bundle, "server-functions/default/index.mjs"), path.join(bundle, "twin.mjs"));
      const run = check(["--tar-archive", systemTar()]);
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/^check-bundle: entrada \d+ del tar: hardlink no permitido\n$/);
    });

    it("rejects absolute paths, .. segments and names outside .open-next/, by entry number only", () => {
      const run = checkArchive(
        [
          ".open-next/ok.js",
          "/etc/passwd",
          ".open-next/../outside",
          "other/file",
          "./.open-next/x",
          "..",
          ".open-next-evil/x",
          ".open-next/a/../../b",
        ].map(file),
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        [2, 3, 4, 5, 6, 7, 8].map((entry) => `check-bundle: entrada ${entry} del tar fuera de .open-next/\n`).join(""),
      );
      expect(run.stderr).not.toContain("passwd");
    });

    it("accepts relative symlinks that stay inside .open-next/ and directory entries", () => {
      const run = checkArchive([
        directory(".open-next/"),
        file(".open-next/server/x.js"),
        symlink(".open-next/ok", "server/x.js"),
        symlink(".open-next/n/m", "../ok"),
        symlink(".open-next/self", "."),
      ]);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    });

    it("rejects symlinks with an absolute, empty or escaping target, without printing it", () => {
      const run = checkArchive([
        symlink(".open-next/a", "/etc/passwd"),
        symlink(".open-next/b", "../outside"),
        symlink(".open-next/c/d", "../../.open-next-evil"),
        symlink(".open-next/e", ""),
        symlink(".open-next/f", ".."),
      ]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        [1, 2, 3, 4, 5].map((entry) => `check-bundle: entrada ${entry} del tar: symlink fuera de .open-next/\n`).join(""),
      );
      expect(run.stderr).not.toContain("passwd");
    });

    it("rejects hardlink entries even when their target is inside .open-next/", () => {
      const run = checkArchive([file(".open-next/a.js"), member({ name: ".open-next/b.js", type: "1", linkname: ".open-next/a.js" })]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe("check-bundle: entrada 2 del tar: hardlink no permitido\n");
    });

    it("rejects any entry whose path goes through a symlink entry, before or after it", () => {
      const run = checkArchive([
        file(".open-next/early/x.js"),
        symlink(".open-next/early", "sub"),
        symlink(".open-next/late", "sub"),
        file(".open-next/late/y.js"),
        file(".open-next/lateral.js"),
      ]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        "check-bundle: entrada 1 del tar: ruta a través de un symlink\n" +
          "check-bundle: entrada 4 del tar: ruta a través de un symlink\n",
      );
    });

    it.each([
      ["a character device", "3"],
      ["a block device", "4"],
      ["a fifo", "6"],
      ["a contiguous file", "7"],
      ["a global pax header", "g"],
      ["an unknown type", "Z"],
    ])("rejects %s entry", (_label, type) => {
      const run = checkArchive([file(".open-next/a.js"), member({ name: ".open-next/dev", type })]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe("check-bundle: entrada 2 del tar: tipo de entrada no permitido\n");
    });

    it("honors GNU long names and long link names instead of the truncated header", () => {
      const deep = `.open-next/${"d".repeat(120)}/index.js`;
      const run = checkArchive([
        gnuLong("L", deep),
        file(".open-next/short"),
        gnuLong("L", "../evil"),
        file(".open-next/hidden"),
        gnuLong("K", "/etc/passwd"),
        symlink(".open-next/l", "ok"),
      ]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        "check-bundle: entrada 2 del tar fuera de .open-next/\n" +
          "check-bundle: entrada 3 del tar: symlink fuera de .open-next/\n",
      );
    });

    it("honors pax path and linkpath records instead of the header fields", () => {
      const run = checkArchive([
        pax({ path: `.open-next/${"p".repeat(150)}.js` }),
        file(".open-next/short"),
        pax({ path: "/etc/passwd" }),
        file(".open-next/hidden"),
        pax({ linkpath: "../../outside" }),
        symlink(".open-next/l", "ok"),
      ]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe(
        "check-bundle: entrada 2 del tar fuera de .open-next/\n" +
          "check-bundle: entrada 3 del tar: symlink fuera de .open-next/\n",
      );
    });

    it("fails closed on a missing argument, an unreadable file or something that is not gzip", () => {
      const noFile = check(["--tar-archive"]);
      expect(noFile.status).toBe(1);
      expect(noFile.stderr).toBe("check-bundle: falta la ruta del tar\n");

      const missing = check(["--tar-archive", path.join(workDir, "missing.tgz")]);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toBe("check-bundle: no se pudo leer el tar\n");

      const plain = path.join(workDir, "plain.tgz");
      writeFileSync(plain, "not gzip");
      const notGzip = check(["--tar-archive", plain]);
      expect(notGzip.status).toBe(1);
      expect(notGzip.stderr).toBe("check-bundle: no se pudo leer el tar\n");
    });

    it("fails closed on an empty archive", () => {
      const run = checkArchive([]);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe("check-bundle: el tar no tiene entradas\n");
    });

    it("fails closed on a bad header checksum, a truncated body or a missing end of archive", () => {
      const tampered = file(".open-next/a.js");
      tampered.write("x", 0);
      const badChecksum = checkArchive([tampered]);
      expect(badChecksum.status).toBe(1);
      expect(badChecksum.stderr).toBe("check-bundle: el tar está corrupto o truncado\n");

      const truncatedBody = member({ name: ".open-next/big.js", body: "x".repeat(2000) }).subarray(0, 1024);
      const truncated = check(["--tar-archive", writeArchive([truncatedBody], Buffer.alloc(0))]);
      expect(truncated.status).toBe(1);
      expect(truncated.stderr).toBe("check-bundle: el tar está corrupto o truncado\n");

      const noEnd = check(["--tar-archive", writeArchive([file(".open-next/a.js")], Buffer.alloc(0))]);
      expect(noEnd.status).toBe(1);
      expect(noEnd.stderr).toBe("check-bundle: el tar está corrupto o truncado\n");
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

describe("smoke.mjs", () => {
  const TITLE = "<title>EncuéntrameVzla — Buscador de pacientes</title>";
  const BODY_MARKER = "synthetic-body-marker";

  type Handler = (req: IncomingMessage, res: ServerResponse) => void;
  type Route = Record<string, Handler[]>;

  let server: Server;
  let baseUrl: string;
  let requests: string[];
  let routes: Route;

  const page = (status: number, body: string): Handler => (_req, res) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  };
  const redirect = (status: number, location: string): Handler => (_req, res) => {
    res.writeHead(status, { location });
    res.end(BODY_MARKER);
  };
  const home = page(200, `<html><head>${TITLE}</head><body>${BODY_MARKER}</body></html>`);
  const adminRedirect = redirect(307, "/admin/login");

  // spawnSync bloquearía el event loop del servidor local; el smoke corre asíncrono.
  const smoke = (args: string[] = [baseUrl], env: Record<string, string> = {}): Promise<ScriptRun> =>
    new Promise((resolveRun) => {
      const child = spawn(process.execPath, [path.join(scriptsDir, "smoke.mjs"), ...args], {
        env: { PATH: process.env.PATH ?? "", SMOKE_RETRY_DELAY_MS: "1", SMOKE_REQUEST_TIMEOUT_MS: "300", ...env },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.on("close", (status) => resolveRun({ status, stdout, stderr, output: "" }));
    });

  beforeEach(async () => {
    requests = [];
    routes = { "/": [home], "/admin": [adminRedirect] };
    server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      const handlers = routes[req.url ?? ""] ?? [page(404, BODY_MARKER)];
      const handler = handlers.length > 1 ? handlers.shift() : handlers[0];
      handler?.(req, res);
    });
    await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((closed) => server.close(() => closed()));
  });

  it("passes when / is 200 with the stable title and /admin redirects to /admin/login, without following it", async () => {
    const run = await smoke();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(requests).toEqual(["GET /", "GET /admin"]);
    expect(run.stdout).not.toContain(BODY_MARKER);
  });

  it("exports only / and /admin as the paths it requests", () => {
    const listed = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(path.join(scriptsDir, "smoke.mjs"))}); process.stdout.write(JSON.stringify(m.SMOKE_PATHS));`,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(listed)).toEqual(["/", "/admin"]);
  });

  it("fails after 5 attempts printing path, status and attempt but never the body", async () => {
    routes["/"] = [page(404, BODY_MARKER)];
    const run = await smoke();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe([1, 2, 3, 4, 5].map((attempt) => `smoke: / 404 intento ${attempt}/5\n`).join(""));
    expect(run.stdout + run.stderr).not.toContain(BODY_MARKER);
    expect(requests).toEqual(Array(5).fill("GET /"));
  });

  it("retries until the site answers and passes within the 5 attempts", async () => {
    routes["/"] = [page(503, BODY_MARKER), page(503, BODY_MARKER), home];
    const run = await smoke();
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("smoke: / 503 intento 1/5\nsmoke: / 503 intento 2/5\n");
    expect(requests).toEqual(["GET /", "GET /", "GET /", "GET /admin"]);
  });

  it("fails when / is 200 without the stable title", async () => {
    routes["/"] = [page(200, `<html><head><title>Otro sitio</title></head><body>${BODY_MARKER}</body></html>`)];
    const run = await smoke();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      [1, 2, 3, 4, 5].map((attempt) => `smoke: / 200 intento ${attempt}/5: título ausente\n`).join(""),
    );
    expect(run.stdout + run.stderr).not.toContain("Otro sitio");
  });

  it("fails when /admin is not a redirect or does not point to /admin/login", async () => {
    routes["/admin"] = [page(404, BODY_MARKER)];
    const notFound = await smoke();
    expect(notFound.status).toBe(1);
    expect(notFound.stderr).toBe([1, 2, 3, 4, 5].map((attempt) => `smoke: /admin 404 intento ${attempt}/5\n`).join(""));

    routes["/admin"] = [page(200, BODY_MARKER)];
    const served = await smoke();
    expect(served.status).toBe(1);
    expect(served.stderr).toContain("smoke: /admin 200 intento 5/5\n");

    routes["/admin"] = [redirect(307, "/admin/login-elsewhere")];
    const elsewhere = await smoke();
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.stderr).toContain("smoke: /admin 307 intento 1/5: redirección inesperada\n");
    expect(elsewhere.stderr).not.toContain("login-elsewhere");

    routes["/admin"] = [redirect(302, "")];
    const empty = await smoke();
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain("smoke: /admin 302 intento 1/5: redirección inesperada\n");
    expect(requests).not.toContain("GET /admin/login");
  });

  it("accepts an absolute Location whose path is /admin/login", async () => {
    routes["/admin"] = [redirect(308, `${baseUrl}/admin/login?next=%2Fadmin`)];
    const run = await smoke();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(requests).toEqual(["GET /", "GET /admin"]);
  });

  it("fails when /admin redirects to /admin/login on another origin", async () => {
    routes["/admin"] = [redirect(307, "https://other.example/admin/login")];
    const run = await smoke();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("smoke: /admin 307 intento 1/5: redirección inesperada\n");
    expect(run.stderr).not.toContain("other.example");
  });

  it("treats a request that never answers as a failed attempt and ends red after 5", async () => {
    routes["/"] = [() => undefined];
    const run = await smoke();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe([1, 2, 3, 4, 5].map((attempt) => `smoke: / sin-respuesta intento ${attempt}/5\n`).join(""));
    expect(requests).toEqual(Array(5).fill("GET /"));
  });

  it("fails closed without a valid http(s) base URL and makes no request", async () => {
    for (const args of [[], ["not a url"], ["ftp://127.0.0.1/"]]) {
      const run = await smoke(args);
      expect(run.status).toBe(1);
      expect(run.stderr).toBe("smoke: falta la URL base http(s) del sitio\n");
    }
    expect(requests).toEqual([]);
  });
});

describe("write-summary.mjs", () => {
  const DEPLOY_SHA = "0123456789abcdef0123456789abcdef01234567";
  const DOMAIN = "d1a2b3c4d5e6f7.cloudfront.net";
  const PRIVATE_VALUES = [
    "sa-east-1_SyntheticPool",
    "synthetic-client-id-0000",
    "evzla-synthetic-uploads-bucket",
    "arn:aws:lambda:sa-east-1:000000000000:function:synthetic",
  ];

  let workDir: string;
  let summaryFile: string;
  let outputsFile: string;

  const writeOutputs = (evzlaStack: Record<string, string>): void => {
    const outputs = {
      EvzlaStack: {
        UserPoolId: PRIVATE_VALUES[0],
        UserPoolClientId: PRIVATE_VALUES[1],
        UploadsBucketName: PRIVATE_VALUES[2],
        ServerFunctionArn: PRIVATE_VALUES[3],
        ...evzlaStack,
      },
    };
    writeFileSync(outputsFile, JSON.stringify(outputs));
  };

  const writeSummary = (env: Record<string, string> = {}, args: string[] = [outputsFile]): ScriptRun => {
    const result = spawnSync(process.execPath, [path.join(scriptsDir, "write-summary.mjs"), ...args], {
      cwd: workDir,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", GITHUB_STEP_SUMMARY: summaryFile, DEPLOY_SHA, ...env },
      timeout: 30_000,
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: readFileSync(summaryFile, "utf8") };
  };

  const expectNoPrivateValue = (run: ScriptRun): void => {
    for (const value of PRIVATE_VALUES) {
      expect(run.output).not.toContain(value);
      expect(run.stdout).not.toContain(value);
      expect(run.stderr).not.toContain(value);
    }
  };

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "evzla-write-summary-"));
    summaryFile = path.join(workDir, "step-summary.md");
    outputsFile = path.join(workDir, "cdk-outputs.json");
    writeFileSync(summaryFile, "");
    writeOutputs({ CloudFrontDomain: DOMAIN });
  });

  afterEach(() => rmSync(workDir, { recursive: true, force: true }));

  it("writes only the deployed SHA and the CloudFront domain to the step summary", () => {
    const run = writeSummary();
    expect(run.status).toBe(0);
    expect(run.output).toBe(`## Deploy de producción\n\n- SHA: \`${DEPLOY_SHA}\`\n- CloudFront: \`${DOMAIN}\`\n`);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
    expectNoPrivateValue(run);
  });

  it("appends to an existing step summary without replacing it", () => {
    writeFileSync(summaryFile, "previous step\n");
    const run = writeSummary();
    expect(run.status).toBe(0);
    expect(run.output.startsWith("previous step\n")).toBe(true);
    expect(run.output).toContain(DEPLOY_SHA);
  });

  it("fails closed without writing when CloudFrontDomain is missing", () => {
    writeOutputs({});
    const run = writeSummary();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("write-summary: falta EvzlaStack.CloudFrontDomain válido en el archivo de outputs\n");
    expect(run.output).toBe("");
    expectNoPrivateValue(run);
  });

  it("rejects a CloudFrontDomain that is not a CloudFront hostname, so nothing else can ride into the summary", () => {
    for (const domain of [`${DOMAIN}\n- UserPoolId: ${PRIVATE_VALUES[0]}`, "evil.example.com", `${DOMAIN}\``, ""]) {
      writeOutputs({ CloudFrontDomain: domain });
      const run = writeSummary();
      expect(run.status).toBe(1);
      expect(run.output).toBe("");
      expectNoPrivateValue(run);
    }
  });

  it("fails closed without echoing the file when the outputs are not valid JSON", () => {
    writeFileSync(outputsFile, `{ "EvzlaStack": { "UserPoolId": "${PRIVATE_VALUES[0]}" `);
    const run = writeSummary();
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("write-summary: no se pudo leer el archivo de outputs\n");
    expect(run.output).toBe("");
    expectNoPrivateValue(run);
  });

  it("fails closed when the outputs file is missing or not given", () => {
    for (const args of [[path.join(workDir, "absent.json")], []]) {
      const run = writeSummary({}, args);
      expect(run.status).toBe(1);
      expect(run.output).toBe("");
    }
  });

  it("fails closed when DEPLOY_SHA is not a 40-hex SHA", () => {
    for (const sha of ["", "main", DEPLOY_SHA.toUpperCase(), `${DEPLOY_SHA}\n- injected`]) {
      const run = writeSummary({ DEPLOY_SHA: sha });
      expect(run.status).toBe(1);
      expect(run.stderr).toBe("write-summary: DEPLOY_SHA no es un SHA de 40 hex\n");
      expect(run.output).toBe("");
    }
  });

  it("fails closed when GITHUB_STEP_SUMMARY is not set", () => {
    const run = writeSummary({ GITHUB_STEP_SUMMARY: "" });
    expect(run.status).toBe(1);
    expect(run.stderr).toBe("write-summary: falta GITHUB_STEP_SUMMARY\n");
    expect(run.output).toBe("");
  });
});
