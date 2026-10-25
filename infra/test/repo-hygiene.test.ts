import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { isolatedGitEnv } from "./support/git-env.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const publicEnvFile = "apps/web/.env.production";

function git(...args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", env: isolatedGitEnv });
  return { status: result.status, stdout: result.stdout };
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lines(relativePath: string): string[] {
  return readRepoFile(relativePath).split(/\r?\n/).map((line) => line.trim());
}

function isIgnored(relativePath: string): boolean {
  return git("check-ignore", "--no-index", "-q", relativePath).status === 0;
}

describe(".gitignore", () => {
  const ignoreLines = lines(".gitignore");

  it("re-includes only the public env file, right after the .env.* rule", () => {
    const envRule = ignoreLines.indexOf(".env.*");
    expect(envRule).toBeGreaterThanOrEqual(0);
    expect(ignoreLines[envRule + 1]).toBe(`!${publicEnvFile}`);
  });

  it("has no broad negation of env files", () => {
    expect(ignoreLines).not.toContain("!.env.*");
    expect(ignoreLines).not.toContain("!**/.env*");
  });

  it.each([".env", "apps/web/.env", "apps/web/.env.local"])("keeps %s ignored", (envPath) => {
    expect(isIgnored(envPath)).toBe(true);
  });

  it("does not ignore the public env file", () => {
    expect(isIgnored(publicEnvFile)).toBe(false);
  });
});

// El contenido del archivo nunca se imprime: las aserciones son booleanas o de conteo.
describe("apps/web/.env.production", () => {
  it("is tracked by git", () => {
    expect(git("ls-files", "--error-unmatch", publicEnvFile).status).toBe(0);
  });

  it("holds exactly one non-empty line, the Turnstile site key", () => {
    const nonEmpty = lines(publicEnvFile).filter((line) => line !== "");
    expect(nonEmpty.length).toBe(1);
    expect(nonEmpty[0]?.startsWith("NEXT_PUBLIC_TURNSTILE_SITE_KEY=")).toBe(true);
  });

  it("passes check-public-env.mjs", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "infra/scripts/ci/check-public-env.mjs"), path.join(repoRoot, publicEnvFile)],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
  });
});

describe("secret scan", () => {
  // Los patrones se arman por partes para que este archivo no se detecte a sí mismo. No se importan de
  // check-bundle.mjs a propósito: allí el nombre de la secret key de AWS exige un valor asignado (el AWS SDK
  // del bundle lo menciona), y en el repo cualquier mención ya es sospechosa.
  const secretPatterns = [
    new RegExp("AKIA" + "[0-9A-Z]{16}"),
    new RegExp("aws_secret" + "_access_key", "i"),
    new RegExp("-----BEGIN " + "[^\\n]*" + "PRIVATE KEY" + "-----"),
  ];

  it("finds no AWS keys or private keys in .github/, infra/ and the public env file", () => {
    const candidates = git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ".github", "infra", publicEnvFile)
      .stdout.split("\0")
      .filter((file) => file !== "" && !file.split("/").some((part) => part === "node_modules" || part === "cdk.out"));
    expect(candidates).toContain(publicEnvFile);

    const offending = candidates.filter((file) => {
      const content = readRepoFile(file);
      return secretPatterns.some((pattern) => pattern.test(content));
    });
    expect(offending).toEqual([]);
  });
});

describe("CODEOWNERS", () => {
  const ownedPatterns = lines(".github/CODEOWNERS")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/))
    .filter(([, ...owners]) => owners.length > 0 && owners.every((owner) => owner.startsWith("@")))
    .map(([pattern]) => pattern);

  it.each(["/.github/", "/infra/"])("assigns an owner to %s", (pattern) => {
    expect(ownedPatterns).toContain(pattern);
  });
});

function markdownSection(relativePath: string, heading: string): string {
  const content = readRepoFile(relativePath);
  const start = content.indexOf(`\n${heading}\n`);
  if (start < 0) return "";
  const next = content.indexOf("\n## ", start + heading.length + 1);
  return content.slice(start, next < 0 ? undefined : next);
}

// Los greps afirman conceptos, no la redacción: ignoran el énfasis markdown y el ajuste de línea.
function plainProse(markdown: string): string {
  return markdown.replace(/\*\*|`/g, "").replace(/\s+/g, " ");
}

describe("deploy documentation (AC-30)", () => {
  const deploySection = markdownSection("docs/ARCHITECTURE.md", "## 11. Deploy");
  const deployProse = plainProse(deploySection);

  it("reads only § 11 and yields nothing for a missing heading, so the greps fail closed", () => {
    expect(deploySection.trimStart().startsWith("## 11. Deploy")).toBe(true);
    expect(deploySection).not.toMatch(/\n## (?!11\. Deploy)/);
    expect(markdownSection("docs/ARCHITECTURE.md", "## 99. Missing")).toBe("");
  });

  it.each([
    ["manual migration over the SSM tunnel as evzla_owner", /túnel SSM[\s\S]{0,200}?evzla_owner[\s\S]{0,200}?OK explícito/i],
    ["migration before merging to main", /antes de mergear a main/i],
    ["approval of the Production environment", /environment Production/],
    ["deploy of EvzlaStack", /cdk deploy EvzlaStack/],
    ["smoke after the deploy", /smoke contra https:\/\/encuentramevzla\.com/i],
    ["expand/contract in separate PRs", /expand\/contract[\s\S]{0,200}?PR distint/i],
    ["rollback by workflow_dispatch with ref", /workflow_dispatch desde main con el input ref/],
    ["rollback only with a compatible schema", /no revierte el esquema[\s\S]{0,200}?solo es seguro si el código viejo es compatible/i],
    ["manual deploy of EvzlaCiStack", /cdk --app "pnpm exec tsx bin\/evzla-ci\.ts" deploy EvzlaCiStack/],
    ["residual cfn-exec risk", /cfn-exec[\s\S]{0,200}?AdministratorAccess/],
  ])("ARCHITECTURE § 11 documents the %s", (_label, pattern) => {
    expect(deployProse).toMatch(pattern);
  });

  it("README links the deploy section and the EvzlaCiStack command", () => {
    const readme = plainProse(readRepoFile("README.md"));
    expect(readme).toContain("(docs/ARCHITECTURE.md#11-deploy)");
    expect(readme).toContain('pnpm exec cdk --app "pnpm exec tsx bin/evzla-ci.ts" deploy EvzlaCiStack');
  });

  it("db-prod-scripts skill states migration before merge and never contract with the app", () => {
    const skill = plainProse(readRepoFile(".claude/skills/db-prod-scripts.md"));
    expect(skill).toMatch(/Migración antes del merge/i);
    expect(skill).toMatch(/Nunca contract en el mismo PR que la app/i);
  });

  it("leaves the pull request template free of deploy-pipeline content", () => {
    const template = readRepoFile(".github/pull_request_template.md");
    expect(template).not.toMatch(/deploy-production|EvzlaCiStack|workflow_dispatch|OIDC/);
  });
});

describe("ADR-0011 (AC-31)", () => {
  const rawAdr = readRepoFile("adr/0011-ci-cd-github-actions-oidc.md");
  const statusLine = plainProse(rawAdr.split(/\r?\n/).find((line) => line.startsWith("Fecha:")) ?? "");
  const adr = plainProse(rawAdr);

  it("is ACEPTADO, citing the signature recorded in gates.md", () => {
    expect(statusLine).toMatch(/Estado: ACEPTADO/);
    expect(statusLine).not.toContain("PROPUESTO");
    expect(statusLine).toContain("2026-10-22");
    expect(adr).toContain("docs/sdd/0026-ci-deploy-production/gates.md");
  });

  it.each([
    ["build without credentials in checks", /checks[\s\S]{0,200}?sin credenciales/],
    ["deploy from the artifact of the same run", /artifact del mismo run/],
    ["no own CDK bootstrap", /sin bootstrap propio/],
    ["configure-aws-credentials v6", /configure-aws-credentials v6/],
    ["Production environment as a manual requirement", /requisito manual/],
    ["residual cfn-exec risk", /Riesgo residual:[\s\S]{0,200}?cfn-exec/],
    ["own AWS account as future mitigation", /Mitigación futura[\s\S]{0,200}?cuenta AWS propia/],
  ])("describes the %s", (_label, pattern) => {
    expect(adr).toMatch(pattern);
  });
});

type DependabotGroup = { patterns?: string[]; "applies-to"?: string };
type DependabotUpdate = {
  "package-ecosystem": string;
  directory: string;
  "target-branch"?: string;
  schedule?: { interval?: string };
  "open-pull-requests-limit"?: number;
  groups?: Record<string, DependabotGroup>;
  "commit-message"?: { prefix?: string };
};

describe("dependabot.yml", () => {
  const loadConfig = (): { version: number; updates: DependabotUpdate[] } =>
    parse(readRepoFile(".github/dependabot.yml")) as { version: number; updates: DependabotUpdate[] };
  const updateFor = (ecosystem: string): DependabotUpdate | undefined =>
    loadConfig().updates.find((update) => update["package-ecosystem"] === ecosystem);

  it("declares exactly the github-actions and npm entries", () => {
    const config = loadConfig();
    expect(config.version).toBe(2);
    expect(config.updates.map((update) => update["package-ecosystem"]).sort()).toEqual(["github-actions", "npm"]);
  });

  it("updates github-actions monthly at the root in a single group covering every action", () => {
    const actions = updateFor("github-actions");
    expect(actions?.directory).toBe("/");
    expect(actions?.["target-branch"]).toBe("develop");
    expect(actions?.schedule?.interval).toBe("monthly");
    expect(actions?.["commit-message"]?.prefix).toBe("chore(ci)");
    const groups = Object.values(actions?.groups ?? {});
    expect(groups).toHaveLength(1);
    expect(groups[0]?.patterns).toEqual(["*"]);
  });

  it("opens no npm version PRs and groups every npm security update into one", () => {
    const npm = updateFor("npm");
    expect(npm?.directory).toBe("/");
    expect(npm?.["open-pull-requests-limit"]).toBe(0);
    // Con target-branch las security updates de npm dejarían de abrirse.
    expect(npm?.["target-branch"]).toBeUndefined();
    const securityGroups = Object.values(npm?.groups ?? {}).filter((group) => group["applies-to"] === "security-updates");
    expect(securityGroups).toHaveLength(1);
    expect(securityGroups[0]?.patterns).toEqual(["*"]);
  });
});
