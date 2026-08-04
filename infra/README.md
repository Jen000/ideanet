# IdeaNet infrastructure (AWS CDK)

Everything the AWS adapter (`src/api/aws.js`) talks to: a Cognito user pool, one
DynamoDB table, the Lambda functions behind an HTTP API, and an S3 + CloudFront
site (wired up, not yet deployed to).

## Prerequisites

- Node 18+
- AWS credentials for the target account (`aws configure`, profile `default`)
- `npm i -g aws-cdk` (or use the local `npx cdk`)
- Region: **us-east-1**

## Deploy

```bash
cd infra
npm install
npx cdk bootstrap            # first time only, per account/region
npx cdk deploy --profile default
```

`cdk deploy` prints the four values the frontend needs. Copy them into the app's
`.env` (see `../.env.example`):

| CDK output          | Frontend env var               |
| ------------------- | ------------------------------ |
| `Region`            | `VITE_AWS_REGION`              |
| `UserPoolId`        | `VITE_COGNITO_USER_POOL_ID`   |
| `UserPoolClientId`  | `VITE_COGNITO_CLIENT_ID`      |
| `ApiBaseUrl`        | `VITE_API_BASE_URL`           |

`SiteBucketName` and `SiteUrl` are the (empty) hosting target — see "Frontend
hosting" below.

To tear it all down: `npx cdk destroy --profile default`. The table, bucket and
user pool are `RemovalPolicy.DESTROY` (this is a demo project — no data to keep).

## What gets created

- **Cognito** user pool + public app client (no secret, SRP auth). A
  `pre-signup` trigger auto-confirms accounts so `signUp()` signs the user in
  immediately — there's no email-verification step yet.
- **DynamoDB** single table, on-demand billing:
  | Item              | PK                | SK              |
  | ----------------- | ----------------- | --------------- |
  | a user's network  | `USER#<userId>`   | `NET#<netId>`   |
  | a user's like     | `USER#<userId>`   | `LIKE#<netId>`  |
  | public copy       | `PUBLIC#<netId>`  | `NET`           |

  `GSI1` (`GSI1PK=VISIBILITY#public`, `GSI1SK=<zero-padded score>#<netId>`) backs
  the gallery in a single descending query. It projects only `summary`, `likes`
  and `views`, so a gallery listing never reads the full graph.
- **Lambda + HTTP API** — routes below. Owner-scoped routes require a Cognito ID
  token (JWT authorizer); the two gallery routes are open so a signed-out
  visitor can browse.

  | Method | Path                          | Auth | Handler          |
  | ------ | ----------------------------- | ---- | ---------------- |
  | GET    | `/networks`                   | JWT  | `networks.ts`    |
  | PUT    | `/networks/{id}`              | JWT  | `networks.ts`    |
  | DELETE | `/networks/{id}`              | JWT  | `networks.ts`    |
  | POST   | `/networks/{id}/unpublish`    | JWT  | `networks.ts`    |
  | POST   | `/networks/{id}/like`         | JWT  | `likes.ts`       |
  | GET    | `/likes`                      | JWT  | `likes.ts`       |
  | GET    | `/gallery`                    | open | `gallery.ts`     |
  | GET    | `/public/{id}`                | open | `gallery.ts`     |

- **View counting** — `GET /public/{id}` is a pure read that drops a `{netId}`
  message on an SQS queue. `views-rollup.ts` drains the queue, aggregates per
  network, and applies one `ADD` per network per batch, then refreshes the
  ranking key. So a viral network never hot-writes its counter on every open;
  the tradeoff is that view counts (and gallery ordering) are eventually
  consistent, lagging by the batch window (~30s). A DLQ catches poison messages.

- **Frontend hosting** — a private S3 bucket + CloudFront distribution (Origin
  Access Control, SPA fallback to `index.html`). Created so the target exists,
  but **nothing is deployed to it yet**. To ship the frontend later:

  ```bash
  cd .. && npm run build
  aws s3 sync dist/ s3://<SiteBucketName>/ --delete --profile default
  aws cloudfront create-invalidation --distribution-id <id> --paths '/*' --profile default
  ```

## Server-side authorization

Identity comes only from the validated JWT (`sub`), never from the request body
or path. A user can read/write only items under their own `USER#<sub>` partition;
publish/unpublish/delete verify ownership against the public copy's `ownerId`
before touching it. The gallery and single-public reads take no authorizer at
all, so they work signed-out — and they only ever expose networks whose owner
set `visibility: "public"`.
