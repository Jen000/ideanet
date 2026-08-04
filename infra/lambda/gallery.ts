import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ddb, TABLE, GSI } from "./shared/dynamo.js";
import { GSI_PUBLIC_PK } from "./shared/keys.js";
import { json, handle, HttpError } from "./shared/http.js";
import { getPublic } from "./shared/public.js";
import type { Summary } from "./shared/types.js";

// These two routes carry no authorizer — a signed-out visitor can browse.
const sqs = new SQSClient({});
const QUEUE = process.env.VIEW_QUEUE_URL;

// GET /gallery — public networks ranked by score (highest first).
async function gallery() {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": GSI_PUBLIC_PK },
      ScanIndexForward: false, // GSI1SK is a zero-padded score; descending = most popular first
    })
  );
  const items = (r.Items ?? []).map((i) => {
    const summary = i.summary as Summary;
    // Live counts win over whatever was snapshotted into the summary.
    return { ...summary, likes: i.likes ?? summary.likes, views: i.views ?? summary.views };
  });
  return json(200, items);
}

// GET /public/{id} — open one public network. The read stays a pure read; the
// view is counted asynchronously via the queue so popular networks don't
// hot-write a counter on every open.
async function open(event: APIGatewayProxyEventV2) {
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  const pub = await getPublic(id);
  if (!pub) return json(404, { error: "Not found." });

  if (QUEUE) {
    try {
      await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE, MessageBody: JSON.stringify({ netId: id }) }));
    } catch (err) {
      console.error("view enqueue failed (non-fatal)", err); // never fail a read on a metrics write
    }
  }
  return json(200, { ...pub.net, likes: pub.likes, views: pub.views });
}

export const handler = handle<APIGatewayProxyEventV2>(async (event) => {
  switch (event.routeKey) {
    case "GET /gallery": return gallery();
    case "GET /public/{id}": return open(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
