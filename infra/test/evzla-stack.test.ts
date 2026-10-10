import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../lib/app.js";

const infraDir = fileURLToPath(new URL("..", import.meta.url));
const MAIL_FROM = "Evzla Test <no-reply@example.com>";
const BUDGET_EMAIL = "budget@example.com";
const baseContext = {
  account: "111111111111",
  rdsClientSgId: "sg-0572bad681b9d656f",
  openNextPath: "test/fixtures/web/.open-next",
  customDomain: false,
  mailFrom: MAIL_FROM,
  budgetEmail: BUDGET_EMAIL,
};

function synth(context: Record<string, unknown> = {}) {
  const app = new App({ context: { ...baseContext, ...context } });
  return buildApp(app, infraDir);
}

type Resource = { Type: string; Properties: Record<string, unknown> };

let template: Template;
let resources: Record<string, Resource>;

function functionsWithEnv(key: string): Resource[] {
  return Object.values(resources).filter(
    (r) =>
      r.Type === "AWS::Lambda::Function" &&
      key in ((r.Properties.Environment as { Variables?: object } | undefined)?.Variables ?? {}),
  );
}

function serverFunction(): Resource {
  const [fn] = functionsWithEnv("EVZLA_DB_SECRET_ADMIN");
  if (!fn) throw new Error("server function not found");
  return fn;
}

beforeAll(() => {
  template = Template.fromStack(synth().evzla);
  resources = template.toJSON().Resources as Record<string, Resource>;
});

describe("EvzlaStack", () => {
  it("runs the server on Node 22 arm64, 1024 MB, 60 s inside the private subnets with the RDS client SG", () => {
    expect(serverFunction().Properties).toMatchObject({
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 60,
      VpcConfig: {
        SubnetIds: ["subnet-055b4e1a319f98fd1", "subnet-02cd7bc900352026e"],
        SecurityGroupIds: ["sg-0572bad681b9d656f"],
      },
    });
  });

  it("never creates or mutates VPC/security-group/RDS resources", () => {
    const types = new Set(Object.values(resources).map((r) => r.Type));
    for (const forbidden of [
      "AWS::EC2::SecurityGroup",
      "AWS::EC2::SecurityGroupIngress",
      "AWS::EC2::SecurityGroupEgress",
      "AWS::EC2::VPC",
      "AWS::EC2::Subnet",
      "AWS::RDS::DBInstance",
    ]) {
      expect(types.has(forbidden)).toBe(false);
    }
  });

  it("passes secret names, Cognito ids, uploads bucket and mail sender to the server", () => {
    const env = (serverFunction().Properties.Environment as { Variables: Record<string, unknown> }).Variables;
    expect(env).toMatchObject({
      EVZLA_DB_SECRET_ADMIN: "evzla/db/admin",
      EVZLA_DB_SECRET_PUBLIC: "evzla/db/public",
      EVZLA_APP_SECRET: "evzla/app",
      MAIL_FROM,
      NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem",
    });
    for (const key of [
      "COGNITO_USER_POOL_ID",
      "COGNITO_CLIENT_ID",
      "EVZLA_UPLOADS_BUCKET",
      "CACHE_BUCKET_NAME",
      "REVALIDATION_QUEUE_URL",
      "CACHE_DYNAMO_TABLE",
    ]) {
      expect(env[key]).toBeDefined();
    }
  });

  it("keeps the image function outside the VPC", () => {
    const [image] = functionsWithEnv("BUCKET_NAME");
    expect(image).toBeDefined();
    expect(image?.Properties.VpcConfig).toBeUndefined();
  });

  it("wires revalidation through a FIFO queue and an on-demand tag table", () => {
    template.hasResourceProperties("AWS::SQS::Queue", { FifoQueue: true });
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", { BatchSize: 5 });
    template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "tag", KeyType: "HASH" },
        { AttributeName: "path", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: "revalidate" })],
    });
  });

  it("serves through CloudFront with the default domain and asset behaviors", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: Match.absent(),
        PriceClass: "PriceClass_All",
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: "_next/image*" }),
          Match.objectLike({ PathPattern: "_next/data/*" }),
          Match.objectLike({ PathPattern: "BUILD_ID" }),
          Match.objectLike({ PathPattern: "_next/*" }),
        ]),
      }),
    });
  });

  it("creates the uploads bucket with SSE-KMS, 7-day expiry and PUT CORS", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: { "Fn::Join": ["", ["evzla-uploads-", { Ref: "AWS::AccountId" }]] },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({ ServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } }),
        ],
      },
      LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 7, Status: "Enabled" })] },
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ["PUT"],
            AllowedOrigins: Match.arrayWith(["https://encuentramevzla.com"]),
          }),
        ],
      },
    });
  });

  it("creates the evzla-admin pool with Essentials, email OTP and no self sign-up", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolName: "evzla-admin",
      UserPoolTier: "ESSENTIALS",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      Policies: Match.objectLike({
        SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(["EMAIL_OTP"]) },
      }),
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    });
  });

  it("issues 60-minute access/ID tokens and 30-day refresh tokens", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      RefreshTokenValidity: 30 * 24 * 60,
      TokenValidityUnits: { AccessToken: "minutes", IdToken: "minutes", RefreshToken: "minutes" },
    });
  });

  it("grants the server only the three app secrets, uploads read/write/delete and the Cognito admin actions", () => {
    const serverRole = (serverFunction().Properties.Role as { "Fn::GetAtt": string[] })["Fn::GetAtt"][0];
    const policies = Object.values(resources).filter(
      (r) =>
        r.Type === "AWS::IAM::Policy" &&
        (r.Properties.Roles as { Ref: string }[]).some((role) => role.Ref === serverRole),
    );
    const statements = policies.flatMap(
      (p) => (p.Properties.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement,
    );
    const text = JSON.stringify(statements);
    expect(text).toContain("secret:evzla/db/admin-??????");
    expect(text).toContain("secret:evzla/db/public-??????");
    expect(text).toContain("secret:evzla/app-??????");
    expect(text).not.toContain("evzla/db/job");
    expect(text).not.toContain("evzla/db/owner");
    expect(statements).toContainEqual(
      expect.objectContaining({
        Action: ["cognito-idp:AdminCreateUser", "cognito-idp:AdminDisableUser", "cognito-idp:AdminSetUserPassword"],
        Resource: { "Fn::GetAtt": [expect.stringMatching(/^AdminUserPool/), "Arn"] },
      }),
    );
    expect(statements).toContainEqual(
      expect.objectContaining({ Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"] }),
    );
    expect(text).not.toMatch(/"Resource":"\*"/);
  });

  it("schedules the purge job daily at 03:00 UTC in the VPC with only the job secret", () => {
    const [job] = functionsWithEnv("EVZLA_DB_SECRET_JOB");
    expect(job?.Properties).toMatchObject({
      Environment: { Variables: { EVZLA_DB_SECRET_JOB: "evzla/db/job" } },
      VpcConfig: { SecurityGroupIds: ["sg-0572bad681b9d656f"] },
    });
    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(0 3 * * ? *)",
      ScheduleExpressionTimezone: "Etc/UTC",
    });
  });

  it("retains every log group for one month", () => {
    const groups = Object.values(resources).filter((r) => r.Type === "AWS::Logs::LogGroup");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(g.Properties.RetentionInDays).toBe(30);
  });

  // Un error no capturado puede volcar parámetros de queries: ningún log sale de CloudWatch.
  it("sends every Lambda to an explicit log group with no subscriptions or exports", () => {
    const fns = Object.values(resources).filter((r) => r.Type === "AWS::Lambda::Function");
    for (const fn of fns) {
      expect((fn.Properties.LoggingConfig as { LogGroup?: unknown } | undefined)?.LogGroup).toBeDefined();
    }
    const types = new Set(Object.values(resources).map((r) => r.Type));
    for (const forbidden of [
      "AWS::Logs::SubscriptionFilter",
      "AWS::Logs::Destination",
      "AWS::Logs::DeliveryDestination",
      "AWS::Logs::Delivery",
      "AWS::Logs::AccountPolicy",
      "AWS::KinesisFirehose::DeliveryStream",
    ]) {
      expect(types.has(forbidden)).toBe(false);
    }
  });

  it("sets a USD 5 monthly budget scoped to the project cost tag", () => {
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 5, Unit: "USD" },
        TimeUnit: "MONTHLY",
        CostFilters: { TagKeyValue: ["user:project$encuentramevzla"] },
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Subscribers: [{ SubscriptionType: "EMAIL", Address: BUDGET_EMAIL }] }),
      ]),
    });
  });
});

describe("SES email", () => {
  it("creates the encuentramevzla.com identity with Easy DKIM in its own stack", () => {
    const { email } = synth();
    expect(email.region).toBe("sa-east-1");
    const t = Template.fromStack(email);
    t.hasResourceProperties("AWS::SES::EmailIdentity", {
      EmailIdentity: "encuentramevzla.com",
      DkimAttributes: { SigningEnabled: true },
      MailFromAttributes: Match.absent(),
    });
    for (const i of [1, 2, 3]) {
      t.hasOutput(`DkimRecord${i}Name`, {});
      t.hasOutput(`DkimRecord${i}Value`, {});
    }
  });

  it("sends Cognito mail through SES in sa-east-1 from no-reply@encuentramevzla.com", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      EmailConfiguration: {
        EmailSendingAccount: "DEVELOPER",
        // RFC 2047: el nombre con tilde va codificado en el header From.
        From: `=?UTF-8?B?${Buffer.from("EncuéntrameVzla").toString("base64")}?= <no-reply@encuentramevzla.com>`,
        SourceArn: {
          "Fn::Join": ["", Match.arrayWith([":ses:sa-east-1:111111111111:identity/encuentramevzla.com"])],
        },
      },
    });
  });

  it("deploys after the email stack", () => {
    const { evzla, email } = synth();
    expect(evzla.dependencies).toContain(email);
  });
});

describe("origin verify header", () => {
  it("stores a generated secret as evzla/origin", () => {
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "evzla/origin",
      GenerateSecretString: Match.objectLike({ ExcludePunctuation: true }),
    });
  });

  it("sends x-origin-verify only to the server origin and exposes it as ORIGIN_VERIFY_SECRET", () => {
    const dist = Object.values(resources).find((r) => r.Type === "AWS::CloudFront::Distribution");
    const origins = (dist?.Properties.DistributionConfig as { Origins: Record<string, unknown>[] }).Origins;
    const withHeader = origins.filter((o) =>
      JSON.stringify(o.OriginCustomHeaders ?? []).includes("x-origin-verify"),
    );
    expect(withHeader).toHaveLength(1);
    expect(JSON.stringify(withHeader[0])).toContain("ServerFunction");
    expect(JSON.stringify(withHeader[0])).toContain("{{resolve:secretsmanager:");

    const env = (serverFunction().Properties.Environment as { Variables: Record<string, unknown> }).Variables;
    expect(JSON.stringify(env.ORIGIN_VERIFY_SECRET)).toMatch(/resolve:secretsmanager:/);
  });
});

describe("server bundle symlinks", () => {
  let workDir: string;

  beforeAll(() => {
    // Reproduce OpenNext: .next/node_modules/postgres apunta a node_modules/.pnpm dentro del bundle,
    // y node_modules/postgres apunta fuera de él.
    workDir = mkdtempSync(path.join(tmpdir(), "evzla-open-next-"));
    const web = path.join(workDir, "web");
    cpSync(path.join(infraDir, "test/fixtures/web"), web, { recursive: true });
    const store = path.join(workDir, "store/postgres");
    mkdirSync(store, { recursive: true });
    writeFileSync(path.join(store, "package.json"), JSON.stringify({ name: "postgres" }));
    const modules = path.join(web, ".open-next/server-functions/default/node_modules");
    mkdirSync(modules, { recursive: true });
    symlinkSync(store, path.join(modules, "postgres"), "dir");

    const bundle = path.join(web, ".open-next/server-functions/default");
    const pnpmPostgres = path.join(bundle, "node_modules/.pnpm/postgres@3.4.9/node_modules/postgres");
    mkdirSync(pnpmPostgres, { recursive: true });
    writeFileSync(path.join(pnpmPostgres, "package.json"), JSON.stringify({ name: "postgres" }));
    const nextModules = path.join(bundle, "apps/web/.next/node_modules");
    mkdirSync(nextModules, { recursive: true });
    symlinkSync(path.relative(nextModules, pnpmPostgres), path.join(nextModules, "postgres"), "dir");
  });

  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it("materializes symlinked dependencies inside the server asset", () => {
    const { evzla } = synth({ openNextPath: path.join(workDir, "web/.open-next") });
    const json = Template.fromStack(evzla).toJSON() as { Resources: Record<string, Resource> };
    const server = Object.values(json.Resources).find(
      (r) =>
        r.Type === "AWS::Lambda::Function" &&
        "EVZLA_DB_SECRET_ADMIN" in ((r.Properties.Environment as { Variables: object }).Variables ?? {}),
    );
    const s3Key = (server?.Properties.Code as { S3Key?: string } | undefined)?.S3Key;
    if (!s3Key) throw new Error("server asset key missing");
    const outdir = (evzla.node.root as App).outdir;
    const assetDir = path.join(outdir, `asset.${s3Key.replace(/\.zip$/, "")}`);

    for (const rel of ["node_modules/postgres", "apps/web/.next/node_modules/postgres"]) {
      const dir = path.join(assetDir, rel);
      expect(lstatSync(dir).isSymbolicLink(), rel).toBe(false);
      expect(existsSync(path.join(dir, "package.json")), rel).toBe(true);
    }
  });
});

describe("customDomain flag", () => {
  it("adds a us-east-1 certificate stack and aliases only when enabled", () => {
    const { evzla, certificate } = synth({ customDomain: "true" });
    if (!certificate) throw new Error("certificate stack missing");
    expect(certificate.region).toBe("us-east-1");
    Template.fromStack(certificate).hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: "encuentramevzla.com",
      ValidationMethod: "DNS",
    });
    Template.fromStack(evzla).hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({ Aliases: ["encuentramevzla.com", "www.encuentramevzla.com"] }),
    });
  });

  it("does not create the certificate stack by default", () => {
    expect(synth().certificate).toBeUndefined();
  });
});
