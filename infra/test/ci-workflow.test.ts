import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  "working-directory"?: string;
};

type Job = {
  needs?: string | string[];
  if?: string;
  environment?: unknown;
  concurrency?: unknown;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Step[];
};

type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: unknown;
  jobs?: Record<string, Job>;
};

const workflowPath = fileURLToPath(new URL("../../.github/workflows/deploy-production.yml", import.meta.url));
const rawWorkflow = existsSync(workflowPath) ? readFileSync(workflowPath, "utf8") : "";
const workflow: Workflow = (parse(rawWorkflow) as Workflow | null) ?? {};
const jobs = workflow.jobs ?? {};

const ARM_RUNNER = "ubuntu-24.04-arm";
const ARTIFACT_EVENTS_ONLY = "github.event_name == 'push' || github.event_name == 'workflow_dispatch'";
// v5 corre en node20 (deprecado en los runners); v6 es la primera mayor en node24.
const MIN_CREDENTIALS_MAJOR = 6;
const ALLOWED_ACTIONS = new Set([
  "actions/checkout",
  "pnpm/action-setup",
  "actions/setup-node",
  "actions/upload-artifact",
  "actions/download-artifact",
  "aws-actions/configure-aws-credentials",
]);

function job(name: string): Job {
  return jobs[name] ?? {};
}

function steps(name: string): Step[] {
  return job(name).steps ?? [];
}

function actionOf(step: Step): string | undefined {
  return step.uses?.split("@")[0];
}

function signature(step: Step): string {
  return actionOf(step) ?? step.run?.trim() ?? "";
}

function stepUsing(jobName: string, action: string): Step {
  return steps(jobName).find((step) => actionOf(step) === action) ?? {};
}

function stepRunning(jobName: string, command: string): Step {
  return steps(jobName).find((step) => step.run?.trim() === command) ?? {};
}

const allSteps = Object.values(jobs).flatMap((j) => j.steps ?? []);

describe("deploy-production workflow — triggers and permissions", () => {
  it("exists", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("triggers only on PR to main, push to main and manual dispatch with an optional ref", () => {
    expect(workflow.on).toEqual({
      pull_request: { branches: ["main"] },
      push: { branches: ["main"] },
      workflow_dispatch: {
        inputs: { ref: { description: expect.any(String), type: "string", required: false, default: "" } },
      },
    });
  });

  it("never uses pull_request_target or workflow_run", () => {
    expect(rawWorkflow).not.toMatch(/pull_request_target|workflow_run/);
  });

  it("grants only contents: read at workflow level", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("has no workflow-level concurrency so PR runs are not serialized", () => {
    expect(workflow.concurrency).toBeUndefined();
  });

  it("never references secrets", () => {
    expect(rawWorkflow).not.toMatch(/secrets\./);
  });
});

describe("deploy-production workflow — every job", () => {
  it.each(["resolve", "checks", "deploy"])("%s runs on the arm runner with a timeout", (name) => {
    expect(job(name)["runs-on"]).toBe(ARM_RUNNER);
    expect(job(name)["timeout-minutes"]).toBeGreaterThan(0);
  });

  it("grants id-token only to the deploy job", () => {
    expect(Object.keys(jobs).sort()).toEqual(["checks", "deploy", "resolve"]);
    for (const [name, j] of Object.entries(jobs)) {
      if (name !== "deploy") expect(j.permissions?.["id-token"]).toBeUndefined();
    }
    expect(job("deploy").permissions).toEqual({ contents: "read", "id-token": "write" });
  });

  it("checks out without persisting credentials", () => {
    const checkouts = allSteps.filter((step) => actionOf(step) === "actions/checkout");
    expect(checkouts).toHaveLength(3);
    for (const step of checkouts) expect(step.with?.["persist-credentials"]).toBe(false);
  });

  it("pins every action to a 40-hex SHA with a version comment", () => {
    const usesLines = rawWorkflow.split(/\r?\n/).filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it("pins configure-aws-credentials to major 6 or later, which runs on node24", () => {
    const pins = rawWorkflow.matchAll(/uses: aws-actions\/configure-aws-credentials@[0-9a-f]{40} # v(\d+)\./g);
    const pinnedMajors = [...pins].map((pin) => Number(pin[1]));
    expect(pinnedMajors.length).toBeGreaterThan(0);
    for (const major of pinnedMajors) expect(major).toBeGreaterThanOrEqual(MIN_CREDENTIALS_MAJOR);
  });

  it("uses only the actions approved in the design", () => {
    for (const step of allSteps) {
      const action = actionOf(step);
      if (action !== undefined) expect(ALLOWED_ACTIONS).toContain(action);
    }
  });

  it.each(["resolve", "checks", "deploy"])("%s names every step, without repeating a name", (name) => {
    const names = steps(name).map((step) => step.name?.trim() ?? "");
    expect(names.length).toBeGreaterThan(0);
    for (const stepName of names) expect(stepName).not.toBe("");
    expect(new Set(names).size).toBe(names.length);
  });

  // Guarda única de inyección: más estricta que buscar `inputs.`, ninguna expresión llega al shell.
  it.each(["resolve", "checks", "deploy"])("%s has no expressions inside run scripts", (name) => {
    for (const step of steps(name)) expect(step.run ?? "").not.toContain("${{");
  });
});

describe("deploy-production workflow — resolve job", () => {
  it("checks out the triggering commit with full history and tags", () => {
    expect(steps("resolve")[0]).toMatchObject({
      uses: expect.stringMatching(/^actions\/checkout@/),
      with: { ref: "${{ github.sha }}", "fetch-depth": 0, "persist-credentials": false },
    });
  });

  it("resolves the ref with the script, passing user input only through env", () => {
    const resolveStep = stepRunning("resolve", "node infra/scripts/ci/resolve-ref.mjs");
    expect(resolveStep.id).toBe("ref");
    expect(resolveStep.env).toEqual({
      INPUT_REF: "${{ inputs.ref }}",
      EVENT_NAME: "${{ github.event_name }}",
    });
  });

  it("exposes the resolved sha as job output", () => {
    expect(job("resolve").outputs).toEqual({ sha: "${{ steps.ref.outputs.sha }}" });
  });

  it("runs exactly checkout and resolve-ref", () => {
    expect(steps("resolve").map(signature)).toEqual(["actions/checkout", "node infra/scripts/ci/resolve-ref.mjs"]);
  });
});

describe("deploy-production workflow — checks job", () => {
  it("depends on resolve and builds the resolved sha", () => {
    expect(job("checks").needs).toBe("resolve");
    expect(stepUsing("checks", "actions/checkout").with).toEqual({
      ref: "${{ needs.resolve.outputs.sha }}",
      "persist-credentials": false,
    });
  });

  it("runs the steps in the designed order", () => {
    expect(steps("checks").map(signature)).toEqual([
      "actions/checkout",
      "pnpm/action-setup",
      "actions/setup-node",
      "pnpm install --frozen-lockfile",
      "node infra/scripts/ci/check-public-env.mjs apps/web/.env.production",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm audit --audit-level=high",
      "pnpm --filter @evzla/web build:aws",
      "node infra/scripts/ci/check-bundle.mjs apps/web/.open-next",
      'tar -C apps/web -czf "$RUNNER_TEMP/open-next.tgz" .open-next',
      "actions/upload-artifact",
    ]);
  });

  it("takes the pnpm version from packageManager and sets up Node 22 with pnpm cache", () => {
    expect(stepUsing("checks", "pnpm/action-setup").with?.["version"]).toBeUndefined();
    expect(stepUsing("checks", "actions/setup-node").with).toEqual({ "node-version": 22, cache: "pnpm" });
  });

  it("never configures AWS credentials nor AWS_ variables", () => {
    const serialized = JSON.stringify(job("checks"));
    expect(serialized).not.toContain("configure-aws-credentials");
    expect(serialized).not.toContain("AWS_");
    expect(job("checks").permissions).toBeUndefined();
  });

  it("packs and uploads the bundle only on push and dispatch", () => {
    const tarStep = stepRunning("checks", 'tar -C apps/web -czf "$RUNNER_TEMP/open-next.tgz" .open-next');
    expect(tarStep.if).toBe(ARTIFACT_EVENTS_ONLY);
    expect(stepUsing("checks", "actions/upload-artifact").if).toBe(ARTIFACT_EVENTS_ONLY);
    const unconditional = steps("checks").filter((step) => step !== tarStep && actionOf(step) !== "actions/upload-artifact");
    for (const step of unconditional) expect(step.if).toBeUndefined();
  });

  it("uploads a short-lived tarball named after the run", () => {
    const uploadWith = stepUsing("checks", "actions/upload-artifact").with ?? {};
    expect(uploadWith).toEqual({
      name: "open-next-${{ github.run_id }}",
      path: "${{ runner.temp }}/open-next.tgz",
      "retention-days": 1,
      "if-no-files-found": "error",
      overwrite: true,
    });
  });
});

describe("deploy-production workflow — deploy job", () => {
  const DEPLOY_ROLE_ARN = "arn:aws:iam::934106163170:role/evzla-github-deploy";
  const TAR_CHECK = 'node infra/scripts/ci/check-bundle.mjs --tar-archive "$RUNNER_TEMP/artifact/open-next.tgz"';
  const TAR_EXTRACT = 'tar -xzf "$RUNNER_TEMP/artifact/open-next.tgz" --no-same-owner -C apps/web';
  const BUNDLE_CHECK = "node infra/scripts/ci/check-bundle.mjs apps/web/.open-next";
  const INFRA_INSTALL = "pnpm install --frozen-lockfile --filter @evzla/infra...";
  const SYNTH = "pnpm exec cdk synth --ci --quiet";
  const CDK_DEPLOY =
    "pnpm exec cdk deploy EvzlaStack --app cdk.out --ci --require-approval never --outputs-file cdk-outputs.json";
  const SUMMARY = "node infra/scripts/ci/write-summary.mjs infra/cdk-outputs.json";
  const SMOKE = "node infra/scripts/ci/smoke.mjs https://encuentramevzla.com";
  const MAIN_TIP_CHECK = "node infra/scripts/ci/check-main-tip.mjs";
  const ZIP_CHECK = "command -v zip";

  const deploySteps = () => steps("deploy");
  const indexOf = (predicate: (step: Step) => boolean) => deploySteps().findIndex(predicate);
  const credentialsIndex = () => indexOf((step) => actionOf(step) === "aws-actions/configure-aws-credentials");

  it("needs resolve and checks and never runs on pull requests or outside main", () => {
    expect(job("deploy").needs).toEqual(["resolve", "checks"]);
    expect(job("deploy").if).toBe("github.event_name != 'pull_request' && github.ref == 'refs/heads/main'");
  });

  it("runs in the protected Production environment", () => {
    expect(job("deploy").environment).toBe("Production");
  });

  it("serializes deploys at job level without cancelling the running one", () => {
    expect(job("deploy").concurrency).toEqual({ group: "deploy-production", "cancel-in-progress": false });
    expect(workflow.concurrency).toBeUndefined();
  });

  it("runs the steps in the designed order", () => {
    expect(deploySteps().map(signature)).toEqual([
      "actions/checkout",
      MAIN_TIP_CHECK,
      "actions/download-artifact",
      TAR_CHECK,
      TAR_EXTRACT,
      BUNDLE_CHECK,
      "pnpm/action-setup",
      "actions/setup-node",
      INFRA_INSTALL,
      ZIP_CHECK,
      SYNTH,
      "aws-actions/configure-aws-credentials",
      CDK_DEPLOY,
      SUMMARY,
      SMOKE,
    ]);
  });

  it("checks out the same resolved sha as checks", () => {
    expect(stepUsing("deploy", "actions/checkout").with).toEqual({
      ref: "${{ needs.resolve.outputs.sha }}",
      "persist-credentials": false,
    });
  });

  it("on push, refuses a stale run whose approved sha is no longer the tip of origin/main", () => {
    const tipCheck = stepRunning("deploy", MAIN_TIP_CHECK);
    expect(tipCheck.if).toBe("github.event_name == 'push'");
    expect(tipCheck.env).toEqual({ EXPECTED_SHA: "${{ needs.resolve.outputs.sha }}" });
    const checkout = indexOf((step) => actionOf(step) === "actions/checkout");
    const tipCheckIndex = indexOf((step) => step === tipCheck);
    expect(tipCheckIndex).toBeGreaterThan(checkout);
    expect(tipCheckIndex).toBeLessThan(credentialsIndex());
  });

  it("sets up Node without any package manager cache, so checks cannot seed what deploy installs", () => {
    expect(stepUsing("deploy", "actions/setup-node").with).toEqual({
      "node-version": 22,
      "package-manager-cache": false,
    });
  });

  it("verifies the zip binary used by zip-bundle before the synth", () => {
    const zipCheck = indexOf((step) => step.run?.trim() === ZIP_CHECK);
    expect(zipCheck).toBeGreaterThan(-1);
    expect(zipCheck).toBeLessThan(indexOf((step) => step.run?.trim() === SYNTH));
  });

  it("does not claim that synth runs without AWS access while the job holds id-token: write", () => {
    expect(rawWorkflow).not.toMatch(/nunca corren con acceso a AWS/);
    expect(rawWorkflow).toMatch(/#[^\n]*id-token[^\n]*OIDC/);
  });

  it("downloads only this run's artifact by exact name, without run-id or token", () => {
    expect(stepUsing("deploy", "actions/download-artifact").with).toEqual({
      name: "open-next-${{ github.run_id }}",
      path: "${{ runner.temp }}/artifact",
    });
  });

  it("validates the tar headers before extracting and scans the extracted bundle after", () => {
    const checked = indexOf((step) => step.run?.trim() === TAR_CHECK);
    const extracted = indexOf((step) => step.run?.includes("tar -x") ?? false);
    const scanned = indexOf((step) => step.run?.trim() === BUNDLE_CHECK);
    expect(checked).toBeGreaterThan(-1);
    expect(checked).toBeLessThan(extracted);
    expect(extracted).toBeLessThan(scanned);
    expect(scanned).toBeLessThan(credentialsIndex());
  });

  it("assumes the deploy role through OIDC only, never with access keys", () => {
    expect(stepUsing("deploy", "aws-actions/configure-aws-credentials").with).toEqual({
      "role-to-assume": DEPLOY_ROLE_ARN,
      "aws-region": "sa-east-1",
      "role-session-name": "evzla-deploy-${{ github.run_id }}",
      "role-duration-seconds": 3600,
    });
  });

  it("configures credentials after every install and the synth", () => {
    const credentials = credentialsIndex();
    expect(credentials).toBeGreaterThan(-1);
    deploySteps().forEach((step, index) => {
      if (/pnpm install|cdk synth/.test(step.run ?? "")) expect(index).toBeLessThan(credentials);
    });
  });

  it("never installs, runs tsx or esbuild once credentials are configured", () => {
    const withCredentials = deploySteps().slice(credentialsIndex() + 1);
    expect(withCredentials.length).toBeGreaterThan(0);
    for (const step of withCredentials) {
      expect(step.run ?? "").not.toMatch(/pnpm install|\btsx\b|esbuild|cdk synth|action-setup|setup-node/);
      expect(step.uses).toBeUndefined();
    }
  });

  it("synthesizes and deploys from infra, only EvzlaStack from the synthesized assembly", () => {
    expect(stepRunning("deploy", SYNTH)["working-directory"]).toBe("infra");
    expect(stepRunning("deploy", CDK_DEPLOY)["working-directory"]).toBe("infra");
    const serialized = JSON.stringify(job("deploy"));
    expect(serialized).not.toMatch(/--exclusively|--all\b|EvzlaCiStack|evzla-ci/);
  });

  it("passes the deployed sha to the summary only through env", () => {
    expect(stepRunning("deploy", SUMMARY).env).toEqual({ DEPLOY_SHA: "${{ needs.resolve.outputs.sha }}" });
  });

  it("never builds, lints or tests: the bundle comes only from the artifact", () => {
    for (const step of deploySteps()) {
      expect(step.run ?? "").not.toMatch(/build:aws|next build|open-next build|pnpm (test|lint|build|typecheck)\b/);
    }
  });

  it("never prints the outputs file, the environment or traces commands", () => {
    expect(rawWorkflow).not.toMatch(/set -x|set -o xtrace|cat [^\n]*cdk-outputs/);
    for (const step of allSteps) expect(step.run ?? "").not.toMatch(/^\s*(env|printenv)\b/m);
  });
});
