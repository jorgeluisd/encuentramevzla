import type { App } from "aws-cdk-lib";
import { EvzlaCiStack } from "./ci-stack.js";
import { CONTRACT } from "./contract.js";

export function buildCiApp(app: App): { ci: EvzlaCiStack } {
  const account: unknown = app.node.tryGetContext("account");
  if (account === undefined || account === null || account === "") throw new Error('Falta el context "account"');
  const ci = new EvzlaCiStack(app, "EvzlaCiStack", { env: { account: String(account), region: CONTRACT.region } });
  return { ci };
}
