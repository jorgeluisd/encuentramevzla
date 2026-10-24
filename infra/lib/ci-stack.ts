import { CfnOutput, Duration, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { CONTRACT } from "./contract.js";

export const CI_ACCOUNT = "934106163170";
export const GITHUB_SUB = "repo:jorgeluisd/encuentramevzla:environment:Production";

// cfn-exec e image-publishing quedan fuera a propósito: el rol solo salta a los roles que el CLI usa.
export const BOOTSTRAP_ROLE_ARNS: readonly string[] = ["deploy", "file-publishing", "lookup"].flatMap((role) =>
  [CONTRACT.region, "us-east-1"].map(
    (region) => `arn:aws:iam::${CI_ACCOUNT}:role/cdk-hnb659fds-${role}-role-${CI_ACCOUNT}-${region}`,
  ),
);

const GITHUB_OIDC_HOST = "token.actions.githubusercontent.com";

export class EvzlaCiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    if (props.env?.account !== CI_ACCOUNT) {
      throw new Error(`EvzlaCiStack solo se despliega en la cuenta ${CI_ACCOUNT}`);
    }
    super(scope, id, props);
    Tags.of(this).add(CONTRACT.costTag.key, CONTRACT.costTag.value);

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidc",
      `arn:aws:iam::${CI_ACCOUNT}:oidc-provider/${GITHUB_OIDC_HOST}`,
    );

    const role = new iam.Role(this, "DeployRole", {
      roleName: "evzla-github-deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: "sts.amazonaws.com",
          [`${GITHUB_OIDC_HOST}:sub`]: GITHUB_SUB,
        },
      }),
    });
    role.addToPolicy(new iam.PolicyStatement({ actions: ["sts:AssumeRole"], resources: [...BOOTSTRAP_ROLE_ARNS] }));

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
    new CfnOutput(this, "DeployRoleName", { value: role.roleName });
  }
}
