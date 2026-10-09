import path from "node:path";
import { App } from "aws-cdk-lib";
import { CertificateStack } from "./certificate-stack.js";
import { CONTRACT } from "./contract.js";
import { EmailStack } from "./email-stack.js";
import { EvzlaStack } from "./evzla-stack.js";
import { readOpenNextOutput } from "./open-next-output.js";

export function buildApp(app: App, baseDir: string): {
  evzla: EvzlaStack;
  email: EmailStack;
  certificate?: CertificateStack;
} {
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

  const email = new EmailStack(app, "EvzlaEmailStack", { env: { account, region: CONTRACT.region } });

  const evzla = new EvzlaStack(app, "EvzlaStack", {
    env: { account, region: CONTRACT.region },
    crossRegionReferences: customDomain,
    openNext: readOpenNextOutput(path.resolve(baseDir, ctx("openNextPath"))),
    rdsClientSgId: ctx("rdsClientSgId"),
    mailFrom: ctx("mailFrom"),
    budgetEmail: ctx("budgetEmail"),
    certificate: certificate?.certificate,
  });
  // El user pool exige la identidad SES ya creada.
  evzla.addStackDependency(email);
  return { evzla, email, certificate };
}
