import { CfnOutput, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";
import { CONTRACT } from "./contract.js";

// El DNS vive en Cloudflare: los CNAME de DKIM se cargan a mano a partir de los outputs.
export class EmailStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    Tags.of(this).add(CONTRACT.costTag.key, CONTRACT.costTag.value);

    const identity = new ses.EmailIdentity(this, "DomainIdentity", {
      identity: ses.Identity.domain(CONTRACT.apexDomain),
      dkimSigning: true,
      dkimIdentity: ses.DkimIdentity.easyDkim(),
    });

    identity.dkimRecords.forEach((record, i) => {
      new CfnOutput(this, `DkimRecord${i + 1}Name`, { value: record.name });
      new CfnOutput(this, `DkimRecord${i + 1}Value`, { value: record.value });
    });
  }
}
