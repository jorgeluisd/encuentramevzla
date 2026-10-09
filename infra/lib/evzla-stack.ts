import { fileURLToPath } from "node:url";
import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { bundleJob } from "./bundle-job.js";
import { CONTRACT } from "./contract.js";
import type { OpenNextOutput } from "./open-next-output.js";
import { OpenNextSite } from "./open-next-site.js";

export type EvzlaStackProps = StackProps & {
  openNext: OpenNextOutput;
  rdsClientSgId: string;
  mailFrom: string;
  budgetEmail: string;
  certificate?: acm.ICertificate;
};

const LOG_RETENTION = logs.RetentionDays.ONE_MONTH;
// Lambda Node ≥20 no carga la CA de RDS por defecto; este bundle la incluye.
const RDS_CA_ENV = { NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem" };

export class EvzlaStack extends Stack {
  constructor(scope: Construct, id: string, props: EvzlaStackProps) {
    super(scope, id, props);
    Tags.of(this).add(CONTRACT.costTag.key, CONTRACT.costTag.value);

    const vpc = ec2.Vpc.fromVpcAttributes(this, "BlockealoVpc", {
      vpcId: CONTRACT.vpcId,
      availabilityZones: CONTRACT.privateSubnets.map((s) => s.availabilityZone),
    });
    const vpcSubnets: ec2.SubnetSelection = {
      subnets: CONTRACT.privateSubnets.map((s, i) => ec2.Subnet.fromSubnetAttributes(this, `PrivateSubnet${i}`, s)),
    };
    // mutable:false → CDK nunca agrega reglas al SG de Blockealo.
    const rdsClientSg = ec2.SecurityGroup.fromSecurityGroupId(this, "RdsClientSg", props.rdsClientSgId, {
      mutable: false,
    });

    const secret = (id: string, name: string) => secretsmanager.Secret.fromSecretNameV2(this, id, name);
    const dbAdminSecret = secret("DbAdminSecret", CONTRACT.secrets.dbAdmin);
    const dbPublicSecret = secret("DbPublicSecret", CONTRACT.secrets.dbPublic);
    const dbJobSecret = secret("DbJobSecret", CONTRACT.secrets.dbJob);
    const appSecret = secret("AppSecret", CONTRACT.secrets.app);

    const userPool = new cognito.UserPool(this, "AdminUserPool", {
      userPoolName: CONTRACT.userPoolName,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // Cognito exige PASSWORD en la lista; los usuarios se crean sin contraseña y entran por EMAIL_OTP.
      signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("AdminWebClient", {
      generateSecret: false,
      authFlows: { user: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });

    // Nombre literal (no token) para no crear un ciclo bucket(CORS)→CloudFront→server→bucket.
    const uploadsBucketName = `evzla-uploads-${Aws.ACCOUNT_ID}`;

    const site = new OpenNextSite(this, "Site", {
      output: props.openNext,
      vpc,
      vpcSubnets,
      securityGroup: rdsClientSg,
      logRetention: LOG_RETENTION,
      certificate: props.certificate,
      domainNames: props.certificate ? [CONTRACT.apexDomain, `www.${CONTRACT.apexDomain}`] : undefined,
      environment: {
        ...RDS_CA_ENV,
        EVZLA_DB_SECRET_ADMIN: CONTRACT.secrets.dbAdmin,
        EVZLA_DB_SECRET_PUBLIC: CONTRACT.secrets.dbPublic,
        EVZLA_APP_SECRET: CONTRACT.secrets.app,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: Aws.REGION,
        EVZLA_UPLOADS_BUCKET: uploadsBucketName,
        MAIL_FROM: props.mailFrom,
      },
    });
    const server = site.serverFunction;

    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: uploadsBucketName,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(7), abortIncompleteMultipartUploadAfter: Duration.days(1) }],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            `https://${site.distribution.distributionDomainName}`,
            `https://${CONTRACT.apexDomain}`,
            `https://www.${CONTRACT.apexDomain}`,
          ],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    for (const s of [dbAdminSecret, dbPublicSecret, appSecret]) s.grantRead(server);
    server.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`arn:${Aws.PARTITION}:s3:::${uploadsBucketName}/*`],
      }),
    );
    server.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminCreateUser", "cognito-idp:AdminDisableUser"],
        resources: [userPool.userPoolArn],
      }),
    );

    const purgeFunction = new lambda.Function(this, "PurgeSearchLogFunction", {
      code: bundleJob(fileURLToPath(new URL("../jobs/purge/handler.ts", import.meta.url))),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(60),
      vpc,
      vpcSubnets,
      securityGroups: [rdsClientSg],
      environment: { ...RDS_CA_ENV, EVZLA_DB_SECRET_JOB: CONTRACT.secrets.dbJob },
      logGroup: new logs.LogGroup(this, "PurgeSearchLogLogs", {
        retention: LOG_RETENTION,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    dbJobSecret.grantRead(purgeFunction);

    new scheduler.Schedule(this, "PurgeSearchLogSchedule", {
      description: "Purga diaria de search_log (> 90 días)",
      schedule: scheduler.ScheduleExpression.cron({ minute: "0", hour: "3" }),
      target: new schedulerTargets.LambdaInvoke(purgeFunction, { retryAttempts: 2 }),
    });

    // La cuenta es compartida con Blockealo: el presupuesto filtra por la etiqueta de costo del proyecto.
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "evzla-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 5, unit: "USD" },
        costFilters: { TagKeyValue: [`user:${CONTRACT.costTag.key}$${CONTRACT.costTag.value}`] },
      },
      notificationsWithSubscribers: [
        { comparisonOperator: "GREATER_THAN", notificationType: "ACTUAL", threshold: 80 },
        { comparisonOperator: "GREATER_THAN", notificationType: "FORECASTED", threshold: 100 },
      ].map((notification) => ({
        notification: { ...notification, thresholdType: "PERCENTAGE" },
        subscribers: [{ subscriptionType: "EMAIL", address: props.budgetEmail }],
      })),
    });

    const out = (id: string, value: string) => new CfnOutput(this, id, { value });
    out("CloudFrontDomain", site.distribution.distributionDomainName);
    out("CloudFrontDistributionId", site.distribution.distributionId);
    out("CognitoUserPoolId", userPool.userPoolId);
    out("CognitoClientId", userPoolClient.userPoolClientId);
    out("UploadsBucketName", uploadsBucket.bucketName);
    out("AssetsBucketName", site.assetsBucket.bucketName);
    out("CacheBucketName", site.cacheBucket.bucketName);
    out("ServerFunctionName", server.functionName);
    out("PurgeFunctionName", purgeFunction.functionName);
  }
}
