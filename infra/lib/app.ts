import path from "node:path";
import { App } from "aws-cdk-lib";
import { CertificateStack } from "./certificate-stack.js";
import { CONTRACT } from "./contract.js";
import { EvzlaStack } from "./evzla-stack.js";
import { readOpenNextOutput } from "./open-next-output.js";

export function buildApp(app: App, baseDir: string): { evzla: EvzlaStack; certificate?: CertificateStack } {
  const ctx = (key: string): string => {
    const value: unknown = app.node.tryGetContext(key);
    if (value === undefined || value === null || value === "") throw new Error(`Falta el context "${key}"`);
    return String(value);
  };
  const account = ctx("account");
  const customDomain = ctx("customDomain") === "true";

  const certificate = customDomain
    ? new CertificateStack(app, "EvzlaCertificateStack", {
        env: { account, region: "us-east-1" },
        crossRegionReferences: true,
      })
    : undefined;

  const evzla = new EvzlaStack(app, "EvzlaStack", {
    env: { account, region: CONTRACT.region },
    crossRegionReferences: customDomain,
    openNext: readOpenNextOutput(path.resolve(baseDir, ctx("openNextPath"))),
    rdsClientSgId: ctx("rdsClientSgId"),
    mailFrom: ctx("mailFrom"),
    budgetEmail: ctx("budgetEmail"),
    certificate: certificate?.certificate,
  });
  return { evzla, certificate };
}
