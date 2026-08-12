import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand, QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { userPk, netSk, shareSk } from "./shared/keys.js";
import { caller, body, json, handle, HttpError } from "./shared/http.js";
import { getPublic, putPublicCopy, deletePublicCopy } from "./shared/public.js";
import { resolveAccess, canWrite } from "./shared/access.js";
import { validateNetwork, LIMITS } from "./shared/validate.js";
import { lookupByEmail, upsertDirectory } from "./shared/directory.js";
import { summarize } from "./shared/summary.js";
import type { Network, Collaborator } from "./shared/types.js";

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

// GET /networks/{id} — open a network the caller can access, with their role.
async function open(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const access = await resolveAccess(me.id, id);
  if (!access) throw new HttpError(404, "Not found.");
  return json(200, { net: access.net, role: access.role });
}

// PUT /networks/{id} — create, or update if the caller owns or edits it.
async function save(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const incoming = body<Network>(event);
  validateNetwork(incoming);
  const access = await resolveAccess(me.id, id);

  if (access && !canWrite(access.role)) throw new HttpError(403, "You have view-only access to this network.");

  const isCreate = !access;

  // Cap how many networks one account can own, as a floor against runaway
  // automated creation (rate limiting and signup verification are the front line).
  if (isCreate) {
    const owned = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": userPk(me.id), ":sk": "NET#" },
        Select: "COUNT",
      })
    );
    if ((owned.Count ?? 0) >= LIMITS.netsPerUser) throw new HttpError(400, "You've reached the maximum number of networks.");
  }
  const ownerId = access ? access.ownerId : me.id;
  const iAmOwner = ownerId === me.id;

  // Content comes from the client; ownership, collaborators, counts and (for
  // non-owners) visibility are server-authoritative and can't be spoofed.
  const net: Network = {
    ...incoming,
    id,
    ownerId,
    ownerName: access ? access.net.ownerName : me.name,
    collaborators: access ? access.net.collaborators || [] : [],
    visibility: iAmOwner ? normalizeVisibility(incoming.visibility) : access!.net.visibility,
    createdAt: access ? access.net.createdAt : incoming.createdAt || now(),
    updatedAt: now(),
    likes: access ? access.net.likes || 0 : 0,
    views: access ? access.net.views || 0 : 0,
  };

  // Stale-edit guard: reject if the stored copy moved since the client loaded it.
  const base = typeof incoming.updatedAt === "number" ? incoming.updatedAt : access?.net.updatedAt;
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: userPk(ownerId), SK: netSk(id), net },
        ConditionExpression: isCreate ? "attribute_not_exists(PK)" : "#n.#u = :base",
        ...(isCreate
          ? {}
          : { ExpressionAttributeNames: { "#n": "net", "#u": "updatedAt" }, ExpressionAttributeValues: { ":base": base } }),
      })
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      if (isCreate) throw new HttpError(409, "A network with that id already exists.");
      throw new HttpError(409, "This network was changed by someone else. Reload to get the latest, then reapply your edit.");
    }
    throw err;
  }

  // Both "public" and "open" networks are listed and readable in the gallery;
  // "open" additionally lets anyone signed in edit (enforced in resolveAccess).
  if (net.visibility === "public" || net.visibility === "open") {
    const existing = await getPublic(id);
    await putPublicCopy(net, existing?.likes ?? 0, existing?.views ?? 0, existing?.comments ?? 0);
  } else {
    await deletePublicCopy(id);
  }
  return json(200, net);
}

const normalizeVisibility = (v: unknown): Network["visibility"] =>
  v === "public" || v === "open" ? v : "private";

// DELETE /networks/{id} — owner only. Removes the network, its public copy, and
// every collaborator's share row.
async function remove(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const access = await resolveAccess(me.id, id);
  if (!access) return json(200, {});
  if (access.role !== "owner") throw new HttpError(403, "Only the owner can delete this network.");

  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(me.id), SK: netSk(id) } }));
  await deletePublicCopy(id);
  for (const c of access.net.collaborators || []) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(c.userId), SK: shareSk(id) } }));
  }
  return json(200, {});
}

// POST /networks/{id}/unpublish — owner only.
async function unpublish(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const access = await resolveAccess(me.id, id);
  if (!access) return json(200, {});
  if (access.role !== "owner") throw new HttpError(403, "Only the owner can unpublish this network.");

  await deletePublicCopy(id);
  const net = access.net;
  net.visibility = "private";
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: userPk(me.id), SK: netSk(id), net } }));
  return json(200, {});
}

/* ------------------------------------------------------------- collaborators */

// GET /networks/{id}/collaborators — any member can see who has access.
async function listCollaborators(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const access = await resolveAccess(me.id, id);
  if (!access) throw new HttpError(404, "Not found.");
  return json(200, access.net.collaborators || []);
}

// POST /networks/{id}/collaborators — owner shares by email with a role.
async function addCollaborator(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const { email, role } = body<{ email: string; role: string }>(event);
  if (!email) throw new HttpError(400, "Enter an email.");
  const normalizedRole = role === "editor" ? "editor" : "viewer";

  const access = await resolveAccess(me.id, id);
  if (!access) throw new HttpError(404, "Not found.");
  if (access.role !== "owner") throw new HttpError(403, "Only the owner can share this network.");

  const dir = await lookupByEmail(email);
  if (!dir) throw new HttpError(404, "No IdeaNet user with that email — they need an account first.");
  if (dir.userId === me.id) throw new HttpError(400, "You already own this network.");

  const collab: Collaborator = { userId: dir.userId, email: dir.email, name: dir.name, role: normalizedRole };
  const collaborators = [...(access.net.collaborators || []).filter((c) => c.userId !== dir.userId), collab];

  // Update just the collaborators list, so an active editor's updatedAt guard
  // isn't disturbed by a share.
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: userPk(me.id), SK: netSk(id) },
      UpdateExpression: "SET #n.#c = :c",
      ExpressionAttributeNames: { "#n": "net", "#c": "collaborators" },
      ExpressionAttributeValues: { ":c": collaborators },
    })
  );
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: { PK: userPk(dir.userId), SK: shareSk(id), netId: id, ownerId: me.id, role: normalizedRole, sharedAt: now() } })
  );
  return json(200, collab);
}

// DELETE /networks/{id}/collaborators/{userId} — owner removes a collaborator.
async function removeCollaborator(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const id = pathId(event);
  const collabId = event.pathParameters?.userId;
  if (!collabId) throw new HttpError(400, "Missing user id.");

  const access = await resolveAccess(me.id, id);
  if (!access) throw new HttpError(404, "Not found.");
  if (access.role !== "owner") throw new HttpError(403, "Only the owner can manage sharing.");

  const collaborators = (access.net.collaborators || []).filter((c) => c.userId !== collabId);
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: userPk(me.id), SK: netSk(id) },
      UpdateExpression: "SET #n.#c = :c",
      ExpressionAttributeNames: { "#n": "net", "#c": "collaborators" },
      ExpressionAttributeValues: { ":c": collaborators },
    })
  );
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: userPk(collabId), SK: shareSk(id) } }));
  return json(200, {});
}

// GET /shared — networks shared *with* the caller, as cards + the caller's role.
async function sharedWithMe(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": userPk(me.id), ":sk": "SHARE#" },
    })
  );
  const rows = (r.Items ?? []).map((i) => ({ netId: i.netId as string, ownerId: i.ownerId as string, role: i.role as string }));
  if (!rows.length) return json(200, []);

  const out: any[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const res = await ddb.send(
      new BatchGetCommand({ RequestItems: { [TABLE]: { Keys: chunk.map((row) => ({ PK: userPk(row.ownerId), SK: netSk(row.netId) })) } } })
    );
    const byId = new Map<string, Network>();
    for (const it of res.Responses?.[TABLE] ?? []) byId.set((it.net as Network).id, it.net as Network);
    for (const row of chunk) {
      const net = byId.get(row.netId);
      if (net) out.push({ ...summarize(net), role: row.role });
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return json(200, out);
}

// POST /me — record the caller in the user directory so others can share with
// them by email. Idempotent; returns the public user.
async function syncMe(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const me = caller(event);
  if (me.email) await upsertDirectory({ userId: me.id, email: me.email, name: me.name });
  return json(200, { id: me.id, name: me.name, email: me.email });
}

function pathId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, "Missing network id.");
  return id;
}

export const handler = handle<APIGatewayProxyEventV2WithJWTAuthorizer>(async (event) => {
  switch (event.routeKey) {
    case "GET /networks": return list(event);
    case "GET /networks/{id}": return open(event);
    case "PUT /networks/{id}": return save(event);
    case "DELETE /networks/{id}": return remove(event);
    case "POST /networks/{id}/unpublish": return unpublish(event);
    case "GET /networks/{id}/collaborators": return listCollaborators(event);
    case "POST /networks/{id}/collaborators": return addCollaborator(event);
    case "DELETE /networks/{id}/collaborators/{userId}": return removeCollaborator(event);
    case "GET /shared": return sharedWithMe(event);
    case "POST /me": return syncMe(event);
    default: throw new HttpError(404, `No route for ${event.routeKey}`);
  }
});
