import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { userPk, netSk } from "./shared/keys.js";
import { caller, body, json, handle, HttpError } from "./shared/http.js";
import { getPublic, putPublicCopy, deletePublicCopy } from "./shared/public.js";
import type { Network } from "./shared/types.js";

const now = () => Date.now();

// GET /networks — the caller's own networks, newest first.
async function list(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": userPk(me.id), ":sk": "NET#" },
    })
  );
  const nets = (r.Items ?? []).map((i) => i.net as Network).sort((a, b) => b.updatedAt - a.updatedAt);
  return json(200, nets);
}

// PUT /networks/{id} — create or overwrite one of the caller's networks.
async function save(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  const incoming = body<Network>(event);

  // Ownership and identity are server-authoritative; the client can't spoof them.
  const net: Network = {
    ...incoming,
    id,
    ownerId: me.id,
    ownerName: me.name,
    createdAt: incoming.createdAt || now(),
    updatedAt: now(),
    likes: incoming.likes || 0,
    views: incoming.views || 0,
  };

  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: netSk(id), net } })
  );

  if (net.visibility === "public") {
    // Preserve counts across edits.
    const existing = await getPublic(id);
    if (existing && existing.ownerId !== me.id) throw new HttpError(409, "That id already belongs to another network.");
    await putPublicCopy(net, existing?.likes ?? net.likes, existing?.views ?? net.views);
  } else {
    await deletePublicCopy(id);
  }
  return json(200, net);
}

// DELETE /networks/{id} — remove the caller's network and its public copy.
async function remove(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: netSk(id) } }));
  await unpublishOwned(me.id, id);
  return json(200, {});
}

// POST /networks/{id}/unpublish — take a network out of the gallery.
async function unpublish(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  await unpublishOwned(me.id, id);

  // Reflect the change on the owner's copy too.
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: netSk(id) } }));
  if (r.Item) {
    const net = r.Item.net as Network;
    net.visibility = "private";
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: netSk(id), net } }));
  }
  return json(200, {});
}

// Only the owner may pull a network from the gallery.
async function unpublishOwned(userId: string, netId: string) {
  const pub = await getPublic(netId);
  if (!pub) return;
  if (pub.ownerId !== userId) throw new HttpError(403, "Not your network.");
  await deletePublicCopy(netId);
}

export const handler = handle<APIGatewayProxyEventV2WithJWTAuthorizer>(async (event) => {
  switch (event.routeKey) {
    case "GET /networks": return list(event);
    case "PUT /networks/{id}": return save(event);
    case "DELETE /networks/{id}": return remove(event);
    case "POST /networks/{id}/unpublish": return unpublish(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
