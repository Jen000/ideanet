import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "path";

export interface IdeaNetStackProps extends cdk.StackProps {
  /** "dev" or "prod" — controls resource retention and naming. */
  envName: string;
}

export class IdeaNetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IdeaNetStackProps) {
    super(scope, id, props);

    const isProd = props.envName === "prod";
    // Prod keeps its data if the stack is ever deleted; dev is disposable.
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    cdk.Tags.of(this).add("app", "ideanet");
    cdk.Tags.of(this).add("env", props.envName);

    /* ------------------------------------------------------------------ data
       Single table. Item layout (see lambda/shared/keys.ts for the map):
         owner's networks   PK=USER#<userId>    SK=NET#<netId>
         a user's likes     PK=USER#<userId>    SK=LIKE#<netId>
         public copy        PK=PUBLIC#<netId>   SK=NET
       The public copy carries GSI1 keys so the gallery is one query:
         GSI1PK=VISIBILITY#public   GSI1SK=<zero-padded score>#<netId>
    ------------------------------------------------------------------------ */
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy, // prod: RETAIN, dev: DESTROY
      pointInTimeRecovery: isProd,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      // The gallery only needs the summary + live counts, never the full graph.
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["summary", "likes", "views"],
    });

    /* ------------------------------------------------------------------ auth
       Cognito user pool, email + password. New accounts must confirm a code
       emailed to them before they can sign in, so a bot can't mint accounts on
       throwaway addresses. Uses Cognito's built-in email sender (no SES setup;
       ~50 messages/day in the default tier — move to SES for higher volume).
    ------------------------------------------------------------------------ */
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true }, // Cognito emails a verification code on sign-up
      userVerification: {
        emailSubject: "Your IdeaNet verification code",
        emailBody: "Welcome to IdeaNet. Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy, // prod: RETAIN so accounts survive a stack teardown
    });

    // Public SPA client: no secret, SRP auth (what amazon-cognito-identity-js uses).
    const userPoolClient = userPool.addClient("WebClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    /* ------------------------------------------------ view-count buffering
       openPublic() is a pure read; it drops a {netId} message on this queue.
       The rollup Lambda batches them and applies a single ADD per network,
       so a viral network never hot-writes its counter on every read.
    ------------------------------------------------------------------------ */
    const viewDlq = new sqs.Queue(this, "ViewEventsDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });
    const viewQueue = new sqs.Queue(this, "ViewEvents", {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: viewDlq, maxReceiveCount: 5 },
    });

    /* --------------------------------------------------------------- lambdas */
    const common = {
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        TABLE_NAME: table.tableName,
        GSI_NAME: "GSI1",
      },
      bundling: { format: cdk.aws_lambda_nodejs.OutputFormat.ESM, target: "node22" },
    };

    const networksFn = new NodejsFunction(this, "NetworksFn", {
      ...common,
      entry: path.join(__dirname, "..", "lambda", "networks.ts"),
      handler: "handler",
    });
    const galleryFn = new NodejsFunction(this, "GalleryFn", {
      ...common,
      entry: path.join(__dirname, "..", "lambda", "gallery.ts"),
      handler: "handler",
      environment: { ...common.environment, VIEW_QUEUE_URL: viewQueue.queueUrl },
    });
    const likesFn = new NodejsFunction(this, "LikesFn", {
      ...common,
      entry: path.join(__dirname, "..", "lambda", "likes.ts"),
      handler: "handler",
    });
    const viewsRollupFn = new NodejsFunction(this, "ViewsRollupFn", {
      ...common,
      entry: path.join(__dirname, "..", "lambda", "views-rollup.ts"),
      handler: "handler",
    });
    viewsRollupFn.addEventSource(
      new SqsEventSource(viewQueue, { batchSize: 100, maxBatchingWindow: cdk.Duration.seconds(30) })
    );
    const commentsFn = new NodejsFunction(this, "CommentsFn", {
      ...common,
      entry: path.join(__dirname, "..", "lambda", "comments.ts"),
      handler: "handler",
    });

    // Least-privilege data access.
    table.grantReadWriteData(networksFn);
    table.grantReadWriteData(likesFn);
    table.grantReadData(galleryFn);
    table.grantReadWriteData(viewsRollupFn);
    table.grantReadWriteData(commentsFn);
    viewQueue.grantSendMessages(galleryFn);

    /* ------------------------------------------------------------- http api
       Owner-scoped routes require a valid Cognito ID token; the gallery and
       single public reads are open so a signed-out visitor can browse.
    ------------------------------------------------------------------------ */
    const authorizer = new HttpJwtAuthorizer(
      "JwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { identitySource: ["$request.header.Authorization"], jwtAudience: [userPoolClient.userPoolClientId] }
    );

    const api = new apigw.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ["authorization", "content-type"],
      },
    });

    // Stage-level throttling: a floor so a single client can't flood the API
    // (the AWS account default is ~10k rps). These are default route settings
    // applied to the auto-created $default stage.
    const defaultStage = api.defaultStage?.node.defaultChild as apigw.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = { throttlingRateLimit: 30, throttlingBurstLimit: 60 };
    }

    const networksInt = new HttpLambdaIntegration("NetworksInt", networksFn);
    const galleryInt = new HttpLambdaIntegration("GalleryInt", galleryFn);
    const likesInt = new HttpLambdaIntegration("LikesInt", likesFn);
    const commentsInt = new HttpLambdaIntegration("CommentsInt", commentsFn);

    // Owner-scoped (JWT required). Access within these is enforced per-role in
    // the handler (owner / editor / viewer).
    api.addRoutes({ path: "/networks", methods: [apigw.HttpMethod.GET], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}", methods: [apigw.HttpMethod.GET, apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/unpublish", methods: [apigw.HttpMethod.POST], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/history", methods: [apigw.HttpMethod.GET], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/revert", methods: [apigw.HttpMethod.POST], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/collaborators", methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/collaborators/{userId}", methods: [apigw.HttpMethod.DELETE], integration: networksInt, authorizer });
    api.addRoutes({ path: "/shared", methods: [apigw.HttpMethod.GET], integration: networksInt, authorizer });
    api.addRoutes({ path: "/me", methods: [apigw.HttpMethod.POST], integration: networksInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/comments", methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST], integration: commentsInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/comments/{commentId}", methods: [apigw.HttpMethod.DELETE], integration: commentsInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/like", methods: [apigw.HttpMethod.POST], integration: likesInt, authorizer });
    api.addRoutes({ path: "/likes", methods: [apigw.HttpMethod.GET], integration: likesInt, authorizer });
    api.addRoutes({ path: "/networks/{id}/star", methods: [apigw.HttpMethod.POST], integration: likesInt, authorizer });
    api.addRoutes({ path: "/stars", methods: [apigw.HttpMethod.GET], integration: likesInt, authorizer });
    api.addRoutes({ path: "/starred", methods: [apigw.HttpMethod.GET], integration: likesInt, authorizer });

    // Open (no authorizer) — public gallery must read without an account.
    api.addRoutes({ path: "/gallery", methods: [apigw.HttpMethod.GET], integration: galleryInt });
    api.addRoutes({ path: "/public/{id}", methods: [apigw.HttpMethod.GET], integration: galleryInt });

    /* --------------------------------------------------- frontend hosting
       Wired up but intentionally not deployed to yet (no BucketDeployment).
       The bucket is private; CloudFront reaches it through an Origin Access
       Control. SPA routing falls back to index.html.
    ------------------------------------------------------------------------ */
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy,
      autoDeleteObjects: !isProd, // only dev is torn down; prod is retained
    });
    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    /* ---------------------------------------------------------------- output
       These four map straight onto the frontend's VITE_* env vars.
    ------------------------------------------------------------------------ */
    new cdk.CfnOutput(this, "Environment", { value: props.envName });
    new cdk.CfnOutput(this, "Region", { value: this.region });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "ApiBaseUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "SiteDistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
  }
}
