#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { IdeaNetStack } from "../lib/ideanet-stack";

const app = new cdk.App();

// Region is fixed for this project; account comes from the active AWS profile
// (CDK_DEFAULT_ACCOUNT) so a clean account can `cdk deploy` with no edits here.
new IdeaNetStack(app, "IdeaNetStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "IdeaNet backend: Cognito, DynamoDB, Lambda, HTTP API, S3/CloudFront hosting",
});
