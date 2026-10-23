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

function runScript(script: string, cwd: string, env: Record<string, string>): ScriptRun {
  const outputDir = mkdtempSync(path.join(tmpdir(), "evzla-ci-out-"));
  const outputFile = path.join(outputDir, "github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync(process.execPath, [path.join(scriptsDir, script)], {
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
