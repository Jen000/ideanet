import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./dynamo.js";
import { userPk, netSk, shareSk } from "./keys.js";
import type { Network, Role } from "./types.js";

export interface Access {
  net: Network;
  role: Role; // the caller's role on this network
  ownerId: string; // where the canonical item lives (USER#<ownerId> / NET#<id>)
}

// Resolve what the caller may do with a network. Owners hold the canonical item
// under their own partition; collaborators hold a SHARE row that names the owner
// and their role, which points at that same canonical item.
export async function resolveAccess(userId: string, netId: string): Promise<Access | null> {
  const own = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: userPk(userId), SK: netSk(netId) } }));
  if (own.Item) return { net: own.Item.net as Network, role: "owner", ownerId: userId };

  const share = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: userPk(userId), SK: shareSk(netId) } }));
  if (!share.Item) return null;

  const ownerId = share.Item.ownerId as string;
  const role = share.Item.role as Role;
  const canon = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: userPk(ownerId), SK: netSk(netId) } }));
  if (!canon.Item) return null; // owner deleted it; the membership row is stale
  return { net: canon.Item.net as Network, role, ownerId };
}

export const canWrite = (role: Role) => role === "owner" || role === "editor";
