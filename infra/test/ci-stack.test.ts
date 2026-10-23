import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { BOOTSTRAP_ROLE_ARNS, CI_ACCOUNT, EvzlaCiStack, GITHUB_SUB } from "../lib/ci-stack.js";

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
    const expectedArns = ["deploy", "file-publishing", "lookup"].flatMap((role) =>
      ["sa-east-1", "us-east-1"].map(
        (region) => `arn:aws:iam::934106163170:role/cdk-hnb659fds-${role}-role-934106163170-${region}`,
      ),
    );
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
