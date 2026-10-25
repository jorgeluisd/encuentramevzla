import { execFileSync } from "node:child_process";
import process from "node:process";
import { cli, SHA } from "./cli.mjs";

const { fail } = cli("check-main-tip");

function fetchMainTip() {
  try {
    execFileSync("git", ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", "refs/heads/main"], {
      stdio: "ignore",
    });
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fail("no se pudo leer la punta de origin/main");
  }
}

const expected = process.env.EXPECTED_SHA ?? "";
if (!SHA.test(expected)) fail("EXPECTED_SHA inválido");

if (fetchMainTip() !== expected) {
  fail("el SHA aprobado ya no es la punta de origin/main (run obsoleto); no se despliega");
}
process.stdout.write("check-main-tip: el SHA aprobado es la punta de origin/main\n");
