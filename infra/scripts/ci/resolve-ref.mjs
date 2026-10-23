import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";

const SHA = /^[0-9a-f]{40}$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function fail(message) {
  process.stderr.write(`resolve-ref: ${message}\n`);
  process.exit(1);
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commitOf(revision) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveDispatchRef(ref) {
  if (SHA.test(ref)) return commitOf(ref) ?? fail("el commit no existe en el repositorio");
  if (!TAG.test(ref)) fail("ref inválido");
  if (!gitSucceeds(["show-ref", "--verify", "--quiet", `refs/tags/${ref}`])) fail("el tag no existe");
  return commitOf(`refs/tags/${ref}`) ?? fail("el tag no apunta a un commit");
}

function resolveSha({ EVENT_NAME, INPUT_REF = "", GITHUB_SHA = "" }) {
  const ref = INPUT_REF.trim();
  if (EVENT_NAME !== "workflow_dispatch" || ref === "") {
    if (!SHA.test(GITHUB_SHA)) fail("GITHUB_SHA inválido");
    return GITHUB_SHA;
  }
  const sha = resolveDispatchRef(ref);
  if (!gitSucceeds(["merge-base", "--is-ancestor", sha, "origin/main"])) {
    fail("el commit no es ancestro de origin/main");
  }
  return sha;
}

const { GITHUB_OUTPUT } = process.env;
if (!GITHUB_OUTPUT) fail("falta GITHUB_OUTPUT");

const sha = resolveSha(process.env);
appendFileSync(GITHUB_OUTPUT, `sha=${sha}\n`);
process.stdout.write(`resolve-ref: ${sha}\n`);
