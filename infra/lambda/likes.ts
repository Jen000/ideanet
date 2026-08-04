import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { userPk, likeSk, publicPk, PUBLIC_SK } from "./shared/keys.js";
import { caller, json, handle, HttpError } from "./shared/http.js";
import { refreshRanking } from "./shared/public.js";
import type { Network } from "./shared/types.js";

const now = () => Date.now();

// POST /networks/{id}/like — toggle the caller's like on a public network.
// Signed-in only: the client already gates this, and the JWT authorizer
// guarantees a caller here.
async function toggle(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: likeSk(id) } })
  );
  const wasLiked = !!existing.Item;
  const delta = wasLiked ? -1 : 1;

  if (wasLiked) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: likeSk(id) } }));
  } else {
    await ddb.send(
      new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: likeSk(id), netId: id, createdAt: now() } })
    );
  }

  // Apply the count to the public copy. If it isn't public (or vanished), roll
  // the like row back so the two never drift.
  let likes = 0;
  try {
    const upd = await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: publicPk(id), SK: PUBLIC_SK },
        UpdateExpression: "ADD #likes :d",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: { "#likes": "likes" }, // defensive: alias in case of reserved-word collisions
        ExpressionAttributeValues: { ":d": delta },
        ReturnValues: "ALL_NEW",
      })
    );
    likes = Math.max(0, (upd.Attributes?.likes as number) ?? 0);
    const net = upd.Attributes?.net as Network;
    await refreshRanking(id, { likes, views: (upd.Attributes?.views as number) ?? 0, updatedAt: net?.updatedAt ?? now() });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      // Not a public network — undo the like row and report it.
      if (wasLiked) {
        await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: likeSk(id), netId: id, createdAt: now() } }));
      } else {
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: likeSk(id) } }));
      }
      throw new HttpError(404, "That network isn't public.");
    }
    throw err;
  }

  return json(200, { liked: !wasLiked, likes });
}

// GET /likes — the ids the caller has liked. Empty array when they've liked
// nothing (the client never calls this while signed out).
async function liked(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": userPk(me.id), ":sk": "LIKE#" },
    })
  );
  return json(200, (r.Items ?? []).map((i) => i.netId as string));
}

export const handler = handle<APIGatewayProxyEventV2WithJWTAuthorizer>(async (event) => {
  switch (event.routeKey) {
    case "POST /networks/{id}/like": return toggle(event);
    case "GET /likes": return liked(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
