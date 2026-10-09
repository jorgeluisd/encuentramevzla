import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { CustomResource, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import type { OpenNextOutput } from "./open-next-output.js";

export type OpenNextSiteProps = {
  output: OpenNextOutput;
  vpc: ec2.IVpc;
  vpcSubnets: ec2.SubnetSelection;
  securityGroup: ec2.ISecurityGroup;
  environment: Record<string, string>;
  logRetention: logs.RetentionDays;
  originVerifyValue: string;
  certificate?: acm.ICertificate;
  domainNames?: string[];
};

const CACHE_PREFIX = "_cache";
const ASSETS_PREFIX = "_assets";

export class OpenNextSite extends Construct {
  readonly serverFunction: lambda.Function;
  readonly distribution: cloudfront.Distribution;
  readonly assetsBucket: s3.Bucket;
  readonly cacheBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: OpenNextSiteProps) {
    super(scope, id);
    const { output } = props;
    const region = Stack.of(this).region;
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        retention: props.logRetention,
        removalPolicy: RemovalPolicy.DESTROY,
      });

    const privateBucket = (name: string) =>
      new s3.Bucket(this, name, {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.assetsBucket = privateBucket("AssetsBucket");
    this.cacheBucket = privateBucket("CacheBucket");

    const tagTable = new dynamodb.TableV2(this, "TagTable", {
      partitionKey: { name: "tag", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "path", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      globalSecondaryIndexes: [
        {
          indexName: "revalidate",
          partitionKey: { name: "path", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "revalidatedAt", type: dynamodb.AttributeType.NUMBER },
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const revalidationQueue = new sqs.Queue(this, "RevalidationQueue", {
      fifo: true,
      receiveMessageWaitTime: Duration.seconds(20),
      visibilityTimeout: Duration.seconds(60),
      enforceSSL: true,
    });

    const nodeFunction = (name: string, bundle: { dir: string; handler: string }, extra: Partial<lambda.FunctionProps>) =>
      new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        code: lambda.Code.fromAsset(bundle.dir),
        handler: bundle.handler,
        logGroup: logGroup(name),
        ...extra,
      });

    this.serverFunction = nodeFunction("ServerFunction", output.server, {
      memorySize: 1024,
      timeout: Duration.seconds(60),
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: [props.securityGroup],
      environment: {
        ...props.environment,
        CACHE_BUCKET_NAME: this.cacheBucket.bucketName,
        CACHE_BUCKET_KEY_PREFIX: CACHE_PREFIX,
        CACHE_BUCKET_REGION: region,
        REVALIDATION_QUEUE_URL: revalidationQueue.queueUrl,
        REVALIDATION_QUEUE_REGION: region,
        CACHE_DYNAMO_TABLE: tagTable.tableName,
      },
    });
    this.cacheBucket.grantReadWrite(this.serverFunction);
    tagTable.grantReadWriteData(this.serverFunction);
    revalidationQueue.grantSendMessages(this.serverFunction);

    const imageFunction = nodeFunction("ImageFunction", output.image, {
      memorySize: 1024,
      timeout: Duration.seconds(25),
      environment: {
        BUCKET_NAME: this.assetsBucket.bucketName,
        BUCKET_KEY_PREFIX: ASSETS_PREFIX,
      },
    });
    this.assetsBucket.grantRead(imageFunction);

    const revalidationFunction = nodeFunction("RevalidationFunction", output.revalidation, {
      memorySize: 256,
      timeout: Duration.seconds(30),
    });
    revalidationFunction.addEventSource(new SqsEventSource(revalidationQueue, { batchSize: 5 }));

    if (output.initialization && existsSync(output.initialization.cacheFile)) {
      const initFunction = nodeFunction("TagCacheInitFunction", output.initialization, {
        memorySize: 256,
        timeout: Duration.minutes(5),
        environment: { CACHE_DYNAMO_TABLE: tagTable.tableName },
      });
      tagTable.grantWriteData(initFunction);
      const provider = new cr.Provider(this, "TagCacheInitProvider", {
        onEventHandler: initFunction,
        logGroup: logGroup("TagCacheInitProvider"),
      });
      new CustomResource(this, "TagCacheInit", {
        serviceToken: provider.serviceToken,
        properties: { contentHash: sha256(readFileSync(output.initialization.cacheFile)) },
      });
    }

    this.deployAssets(output, logGroup("AssetsDeployment"));

    // Sin OAC: las Function URL con OAC exigen el hash del body en POST/PUT y rompen los Server Actions.
    const serverUrl = this.serverFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: output.server.streaming ? lambda.InvokeMode.RESPONSE_STREAM : lambda.InvokeMode.BUFFERED,
    });
    const imageUrl = imageFunction.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    const serverOrigin = new origins.FunctionUrlOrigin(serverUrl, {
      customHeaders: { "x-origin-verify": props.originVerifyValue },
    });
    const imageOrigin = new origins.FunctionUrlOrigin(imageUrl);
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.assetsBucket, {
      originPath: `/${ASSETS_PREFIX}`,
    });

    // Next valida el origen de los Server Actions contra x-forwarded-host.
    const forwardHost = new cloudfront.Function(this, "ForwardHostFunction", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;r.headers['x-forwarded-host']=r.headers.host;return r;}",
      ),
    });

    // Las cookies entran a la clave de caché: una respuesta con sesión nunca se sirve a otro usuario.
    const serverCachePolicy = new cloudfront.CachePolicy(this, "ServerCachePolicy", {
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "accept",
        "rsc",
        "next-router-prefetch",
        "next-router-state-tree",
        "next-url",
        "x-prerender-revalidate",
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const imageCachePolicy = new cloudfront.CachePolicy(this, "ImageCachePolicy", {
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("accept"),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      defaultTtl: Duration.days(1),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
    });

    const serverBehavior: cloudfront.BehaviorOptions = {
      origin: serverOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: serverCachePolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      compress: true,
      functionAssociations: [
        { function: forwardHost, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
      ],
    };
    const behaviorFor: Record<string, cloudfront.BehaviorOptions> = {
      default: serverBehavior,
      imageOptimizer: {
        origin: imageOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: imageCachePolicy,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        compress: true,
      },
      s3: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
    };

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};
    for (const b of output.behaviors) {
      if (b.pattern === "*") continue;
      const behavior = b.origin ? behaviorFor[b.origin] : undefined;
      if (!behavior) throw new Error(`Origen desconocido en behavior ${b.pattern}: ${b.origin}`);
      additionalBehaviors[b.pattern] = behavior;
    }

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "EncuéntrameVzla",
      defaultBehavior: serverBehavior,
      additionalBehaviors,
      // Sudamérica solo entra en PRICE_CLASS_ALL.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: props.certificate ? cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 : undefined,
      certificate: props.certificate,
      domainNames: props.domainNames,
    });
  }

  private deployAssets(output: OpenNextOutput, logGroup: logs.ILogGroup) {
    const assets = s3deploy.Source.asset(output.assetsDir);
    new s3deploy.BucketDeployment(this, "VersionedAssets", {
      sources: [assets],
      destinationBucket: this.assetsBucket,
      destinationKeyPrefix: ASSETS_PREFIX,
      include: ["_next/*"],
      exclude: ["*"],
      cacheControl: [s3deploy.CacheControl.fromString("public,max-age=31536000,immutable")],
      // Conserva los chunks de builds anteriores para clientes que aún tienen la versión vieja.
      prune: false,
      memoryLimit: 1024,
      logGroup,
    });
    new s3deploy.BucketDeployment(this, "UnversionedAssets", {
      sources: [assets],
      destinationBucket: this.assetsBucket,
      destinationKeyPrefix: ASSETS_PREFIX,
      exclude: ["_next/*"],
      cacheControl: [s3deploy.CacheControl.fromString("public,max-age=0,s-maxage=31536000,must-revalidate")],
      memoryLimit: 1024,
      logGroup,
    });
    if (output.cacheDir && existsSync(output.cacheDir)) {
      new s3deploy.BucketDeployment(this, "CacheSeed", {
        sources: [s3deploy.Source.asset(output.cacheDir)],
        destinationBucket: this.cacheBucket,
        destinationKeyPrefix: CACHE_PREFIX,
        // El server escribe en este prefijo en runtime: nunca podar.
        prune: false,
        memoryLimit: 1024,
        logGroup,
      });
    }
  }
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

