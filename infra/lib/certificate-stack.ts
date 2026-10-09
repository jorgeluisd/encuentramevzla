import { CfnOutput, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { CONTRACT } from "./contract.js";

// CloudFront solo acepta certificados de us-east-1. El DNS vive en Cloudflare: los CNAME de
// validación se cargan a mano (consola de ACM) mientras el deploy espera.
export class CertificateStack extends Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    Tags.of(this).add(CONTRACT.costTag.key, CONTRACT.costTag.value);

    this.certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: CONTRACT.apexDomain,
      subjectAlternativeNames: [`www.${CONTRACT.apexDomain}`],
      validation: acm.CertificateValidation.fromDns(),
    });
    new CfnOutput(this, "CertificateArn", { value: this.certificate.certificateArn });
  }
}
