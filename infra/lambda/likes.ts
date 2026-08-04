import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand, QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { userPk, netSk, likeSk, starSk, publicPk, PUBLIC_SK } from "./shared/keys.js";
import { caller, json, handle, HttpError } from "./shared/http.js";
import { refreshRanking } from "./shared/public.js";
import { summarize } from "./shared/summary.js";
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

/* ------------------------------------------------------------------ stars
   A star is a private bookmark — "save to come back to". Unlike a like it has
   no public count and no ranking effect; it just lands under the caller's
   USER# partition. A user can star any network they can open (a public one, or
   one of their own). */

// POST /networks/{id}/star — toggle the caller's bookmark.
async function toggleStar(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: starSk(id) } }));
  if (existing.Item) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: starSk(id) } }));
    return json(200, { starred: false });
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: starSk(id), netId: id, createdAt: now() } }));
  return json(200, { starred: true });
}

async function starIds(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const rows = await queryStars(me.id);
  return json(200, rows.map((r) => r.netId));
}

// GET /starred — card summaries for the caller's bookmarks, newest first.
// Resolves each id to a public copy, or the caller's own network if it isn't
// public. Ids that resolve to neither (deleted) drop out.
async function starred(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const rows = await queryStars(me.id);
  const ids = rows.map((r) => r.netId);
  if (!ids.length) return json(200, []);

  const byId = new Map<string, any>();

  // 1) public copies (project only the card fields, never the full graph)
  for (let i = 0; i < ids.length; i += 100) {
    const keys = ids.slice(i, i + 100).map((id) => ({ PK: publicPk(id), SK: PUBLIC_SK }));
    const res = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABLE]: { Keys: keys, ProjectionExpression: "#s, #l, #v", ExpressionAttributeNames: { "#s": "summary", "#l": "likes", "#v": "views" } } },
    }));
    for (const it of res.Responses?.[TABLE] ?? []) {
      if (it.summary) byId.set(it.summary.id, { ...it.summary, likes: it.likes ?? it.summary.likes, views: it.views ?? it.summary.views });
    }
  }

  // 2) for ids not public, try the caller's own copy and summarize it
  const missing = ids.filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const keys = missing.slice(i, i + 100).map((id) => ({ PK: userPk(me.id), SK: netSk(id) }));
    const res = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE]: { Keys: keys } } }));
    for (const it of res.Responses?.[TABLE] ?? []) {
      if (it.net) byId.set(it.net.id, summarize(it.net as Network));
    }
  }

  // preserve bookmark order (queryStars returns newest first)
  const out = ids.map((id) => byId.get(id)).filter(Boolean);
  return json(200, out);
}

// Bookmarks newest-first (STAR# rows carry createdAt).
async function queryStars(userId: string): Promise<{ netId: string; createdAt: number }[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": userPk(userId), ":sk": "STAR#" },
  }));
  return (r.Items ?? [])
    .map((i) => ({ netId: i.netId as string, createdAt: (i.createdAt as number) ?? 0 }))
    .filter((i) => i.netId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const handler = handle<APIGatewayProxyEventV2WithJWTAuthorizer>(async (event) => {
  switch (event.routeKey) {
    case "POST /networks/{id}/like": return toggle(event);
    case "GET /likes": return liked(event);
    case "POST /networks/{id}/star": return toggleStar(event);
    case "GET /stars": return starIds(event);
    case "GET /starred": return starred(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
