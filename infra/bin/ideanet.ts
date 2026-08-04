#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { IdeaNetStack } from "../lib/ideanet-stack";

const app = new cdk.App();

// Pick the environment with `-c env=dev` (defaults to prod). dev and prod are
// fully separate stacks — separate Cognito pool, DynamoDB table, API, etc. — so
// work in dev can never touch prod data. Prod keeps the original stack name so
// the already-deployed stack is updated in place, not duplicated.
const envName = (app.node.tryGetContext("env") as string) || "prod";
if (!["dev", "prod"].includes(envName)) {
  throw new Error(`Unknown env "${envName}". Use -c env=dev or -c env=prod.`);
}
const stackName = envName === "prod" ? "IdeaNetStack" : `IdeaNetStack-${envName}`;

new IdeaNetStack(app, stackName, {
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: `IdeaNet backend (${envName}): Cognito, DynamoDB, Lambda, HTTP API, S3/CloudFront hosting`,
});
