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
};

type Job = {
  needs?: string | string[];
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
  it.each(["resolve", "checks"])("%s runs on the arm runner with a timeout and no id-token", (name) => {
    expect(job(name)["runs-on"]).toBe(ARM_RUNNER);
    expect(job(name)["timeout-minutes"]).toBeGreaterThan(0);
    expect(job(name).permissions?.["id-token"]).toBeUndefined();
  });

  it("sets timeout-minutes on every job", () => {
    for (const j of Object.values(jobs)) expect(j["timeout-minutes"]).toBeGreaterThan(0);
  });

  it("checks out without persisting credentials", () => {
    const checkouts = allSteps.filter((step) => actionOf(step) === "actions/checkout");
    expect(checkouts.length).toBeGreaterThanOrEqual(2);
    for (const step of checkouts) expect(step.with?.["persist-credentials"]).toBe(false);
  });

  it("pins every action to a 40-hex SHA with a version comment", () => {
    const usesLines = rawWorkflow.split(/\r?\n/).filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it("uses only the actions approved in the design", () => {
    for (const step of allSteps) {
      const action = actionOf(step);
      if (action !== undefined) expect(ALLOWED_ACTIONS).toContain(action);
    }
  });

  it("never interpolates user inputs inside run scripts", () => {
    for (const step of allSteps) expect(step.run ?? "").not.toMatch(/\$\{\{\s*inputs\./);
  });

  it.each(["resolve", "checks"])("%s has no expressions inside run scripts", (name) => {
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
