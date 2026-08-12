import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { commentsPk, commentSk } from "./shared/keys.js";
import { caller, body, json, handle, HttpError } from "./shared/http.js";
import { resolveAccess } from "./shared/access.js";
import { getPublic, bumpPublicComments } from "./shared/public.js";
import type { Comment } from "./shared/types.js";

const now = () => Date.now();
const MAX_LEN = 2000;

// You can comment on a network you can see: one shared with you (any role), or
// a public one. Returns whether the caller owns it (owners moderate).
async function access(userId: string, netId: string): Promise<{ ownerId: string; isOwner: boolean }> {
  const a = await resolveAccess(userId, netId);
  if (a) return { ownerId: a.ownerId, isOwner: a.role === "owner" };
  const pub = await getPublic(netId);
  if (!pub) throw new HttpError(404, "Not found.");
  return { ownerId: pub.ownerId, isOwner: pub.ownerId === userId };
}

async function listComments(netId: string): Promise<(Comment & { PK: string; SK: string })[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": commentsPk(netId) },
      ScanIndexForward: true, // oldest first — reads like a thread
    })
  );
  return (r.Items ?? []) as any;
}

// GET /networks/{id}/comments
async function list(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = netId(event);
  await access(me.id, id);
  const rows = await listComments(id);
  return json(200, rows.map(({ PK, SK, ...c }) => c));
}

// POST /networks/{id}/comments  { text }
async function add(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = netId(event);
  await access(me.id, id);
  const text = (body<{ text: string }>(event).text || "").trim().slice(0, MAX_LEN);
  if (!text) throw new HttpError(400, "Comment can't be empty.");

  const comment: Comment = { id: randomUUID(), netId: id, authorId: me.id, authorName: me.name, text, createdAt: now() };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: commentsPk(id), SK: commentSk(comment.createdAt, comment.id), ...comment } }));
  await bumpPublicComments(id, 1);
  return json(200, comment);
}

// DELETE /networks/{id}/comments/{commentId} — author or network owner
async function remove(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = netId(event);
  const commentId = event.pathParameters?.commentId;
  if (!commentId) throw new HttpError(400, "Missing comment id.");
  const { isOwner } = await access(me.id, id);

  const item = (await listComments(id)).find((c) => c.id === commentId);
  if (!item) return json(200, {});
  if (item.authorId !== me.id && !isOwner) throw new HttpError(403, "You can only delete your own comments.");
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
  await bumpPublicComments(id, -1);
  return json(200, {});
}

function netId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  return id;
}

export const handler = handle<APIGatewayProxyEventV2WithJWTAuthorizer>(async (event) => {
  switch (event.routeKey) {
    case "GET /networks/{id}/comments": return list(event);
    case "POST /networks/{id}/comments": return add(event);
    case "DELETE /networks/{id}/comments/{commentId}": return remove(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
