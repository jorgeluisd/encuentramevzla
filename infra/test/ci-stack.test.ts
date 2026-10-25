import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../lib/app.js";
import { buildCiApp } from "../lib/ci-app.js";
import { BOOTSTRAP_ROLE_ARNS, CI_ACCOUNT, EvzlaCiStack, GITHUB_SUB } from "../lib/ci-stack.js";

const infraDir = fileURLToPath(new URL("..", import.meta.url));

type Resource = { Type: string; Properties: Record<string, unknown> };

function synthCi(account: string = CI_ACCOUNT): Template {
  const stack = new EvzlaCiStack(new App(), "EvzlaCiStack", { env: { account, region: "sa-east-1" } });
  return Template.fromStack(stack);
}

let template: Template;
let resources: Record<string, Resource>;

function deployRole(): Resource {
  const roles = Object.values(resources).filter((r) => r.Type === "AWS::IAM::Role");
  const [role] = roles;
  if (roles.length !== 1 || !role) throw new Error(`expected exactly one role, found ${roles.length}`);
  return role;
}

beforeAll(() => {
  template = synthCi();
  resources = template.toJSON().Resources as Record<string, Resource>;
});

describe("EvzlaCiStack", () => {
  it("creates exactly one role evzla-github-deploy with a one-hour session and the project tag", () => {
    template.resourceCountIs("AWS::IAM::Role", 1);
    expect(deployRole().Properties).toMatchObject({
      RoleName: "evzla-github-deploy",
      MaxSessionDuration: 3600,
      Tags: [{ Key: "project", Value: "encuentramevzla" }],
    });
  });

  it("trusts only the GitHub OIDC provider with the exact aud and Production environment sub", () => {
    const trust = deployRole().Properties.AssumeRolePolicyDocument;
    expect(trust).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRoleWithWebIdentity",
          Principal: {
            Federated: "arn:aws:iam::934106163170:oidc-provider/token.actions.githubusercontent.com",
          },
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": "repo:jorgeluisd/encuentramevzla:environment:Production",
            },
          },
        },
      ],
    });
    expect(JSON.stringify(trust)).not.toMatch(/StringLike|\*/);
    expect(GITHUB_SUB).toBe("repo:jorgeluisd/encuentramevzla:environment:Production");
  });

  it("allows only sts:AssumeRole on the six cdk bootstrap roles of both regions", () => {
    const expectedArns = [
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-deploy-role-934106163170-sa-east-1",
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-deploy-role-934106163170-us-east-1",
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-file-publishing-role-934106163170-sa-east-1",
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-file-publishing-role-934106163170-us-east-1",
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-lookup-role-934106163170-sa-east-1",
      "arn:aws:iam::934106163170:role/cdk-hnb659fds-lookup-role-934106163170-us-east-1",
    ];
    const policies = Object.values(resources).filter((r) => r.Type === "AWS::IAM::Policy");
    expect(policies).toHaveLength(1);
    expect(deployRole().Properties).not.toHaveProperty("ManagedPolicyArns");
    expect(deployRole().Properties).not.toHaveProperty("Policies");
    const statements = (policies[0]?.Properties.PolicyDocument as { Statement: unknown[] }).Statement;
    expect(statements).toEqual([{ Effect: "Allow", Action: "sts:AssumeRole", Resource: expectedArns }]);
    expect(BOOTSTRAP_ROLE_ARNS).toEqual(expectedArns);
  });

  it("outputs only DeployRoleArn and DeployRoleName", () => {
    const outputs = (template.toJSON().Outputs ?? {}) as Record<string, unknown>;
    expect(Object.keys(outputs).sort()).toEqual(["DeployRoleArn", "DeployRoleName"]);
    template.hasOutput("DeployRoleArn", { Value: { "Fn::GetAtt": [Match.anyValue(), "Arn"] } });
    template.hasOutput("DeployRoleName", { Value: { Ref: Match.anyValue() } });
  });

  it("refuses an account other than the one its literal ARNs belong to", () => {
    expect(() => synthCi("111111111111")).toThrow(/934106163170/);
  });

  it("imports the OIDC provider by ARN without creating it", () => {
    template.resourceCountIs("AWS::IAM::OIDCProvider", 0);
    const types = Object.values(resources).map((r) => r.Type);
    expect(types.filter((t) => t.startsWith("Custom::") || t === "AWS::Lambda::Function")).toEqual([]);
  });
});

function stackIds(app: App): string[] {
  return app.node.children.filter((child) => Stack.isStack(child)).map((stack) => stack.node.id);
}

describe("buildCiApp", () => {
  it("creates only EvzlaCiStack in the contract region and the account from context", () => {
    const app = new App({ context: { account: CI_ACCOUNT } });
    const { ci } = buildCiApp(app);
    expect(stackIds(app)).toEqual(["EvzlaCiStack"]);
    expect(ci.account).toBe(CI_ACCOUNT);
    expect(ci.region).toBe("sa-east-1");
  });

  it("fails early without the account context", () => {
    expect(() => buildCiApp(new App())).toThrow(/account/);
  });

  it("fails early when the context account is not the one the stack belongs to", () => {
    expect(() => buildCiApp(new App({ context: { account: "111111111111" } }))).toThrow(/934106163170/);
  });

  it("bin/evzla-ci.ts synthesizes EvzlaCiStack as its only stack", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "evzla-ci-synth-"));
    try {
      execFileSync("pnpm", ["exec", "tsx", "bin/evzla-ci.ts"], {
        cwd: infraDir,
        env: { ...process.env, CDK_OUTDIR: outDir, CDK_CONTEXT_JSON: JSON.stringify({ account: CI_ACCOUNT }) },
        stdio: "pipe",
      });
      const manifest = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8")) as {
        artifacts: Record<string, { type: string }>;
      };
      const stacks = Object.entries(manifest.artifacts)
        .filter(([, artifact]) => artifact.type === "aws:cloudformation:stack")
        .map(([id]) => id);
      expect(stacks).toEqual(["EvzlaCiStack"]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("main app stays free of the ci stack", () => {
  it("buildApp does not create EvzlaCiStack", () => {
    const app = new App({
      context: {
        account: "111111111111",
        rdsClientSgId: "sg-0572bad681b9d656f",
        openNextPath: "test/fixtures/web/.open-next",
        customDomain: false,
        mailFrom: "Evzla Test <no-reply@example.com>",
        budgetEmail: "budget@example.com",
      },
    });
    buildApp(app, infraDir);
    expect(stackIds(app)).not.toContain("EvzlaCiStack");
    expect(stackIds(app)).toContain("EvzlaStack");
  });

  it("cdk.json keeps bin/evzla.ts as the default app", () => {
    const cdkJson = JSON.parse(readFileSync(path.join(infraDir, "cdk.json"), "utf8")) as { app: string };
    expect(cdkJson.app).toBe("pnpm exec tsx bin/evzla.ts");
  });
});
