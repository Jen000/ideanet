#!/usr/bin/env bash
# Deploy the frontend to an environment's S3 + CloudFront (run from CloudShell,
# which has AWS credentials and Node). Config is pulled straight from the
# CloudFormation stack outputs, so there's no .env file to keep in sync.
#
#   ./deploy-web.sh dev     # -> the dev stack's CloudFront URL
#   ./deploy-web.sh prod    # (prod normally ships to GitHub Pages instead)
set -euo pipefail

ENV="${1:-dev}"
case "$ENV" in
  prod) STACK="IdeaNetStack" ;;
  dev)  STACK="IdeaNetStack-dev" ;;
  *) echo "Usage: ./deploy-web.sh [dev|prod]"; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Reading outputs from $STACK…"
OUT="$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs' --output json)"
get() { echo "$OUT" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

export VITE_AWS_REGION="$(get Region)"
export VITE_COGNITO_USER_POOL_ID="$(get UserPoolId)"
export VITE_COGNITO_CLIENT_ID="$(get UserPoolClientId)"
export VITE_API_BASE_URL="$(get ApiBaseUrl)"
export VITE_BASE="/"   # CloudFront serves at the domain root, not /ideanet/
BUCKET="$(get SiteBucketName)"
DIST="$(get SiteDistributionId)"
URL="$(get SiteUrl)"

if [ -z "$BUCKET" ] || [ -z "$DIST" ]; then
  echo "Could not read SiteBucketName / SiteDistributionId — is the $ENV stack deployed?"; exit 1
fi

echo "Building frontend for $ENV (env config from stack, base=/)…"
( cd "$ROOT" && npm ci && npm run build )

echo "Syncing to s3://$BUCKET …"
aws s3 sync "$ROOT/dist/" "s3://$BUCKET/" --delete

echo "Invalidating CloudFront $DIST …"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' >/dev/null

echo ""
echo "Done. $ENV site: $URL"
