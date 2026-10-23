import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
