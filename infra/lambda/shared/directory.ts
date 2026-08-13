import { GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./dynamo.js";
import { emailPk, DIRECTORY_SK, usernamePk } from "./keys.js";

export interface DirectoryUser { userId: string; email: string; name: string; }

// A signed-in user records themselves here (via POST /me) so others can share
// networks with them by email. Idempotent; also keeps name/email current.
export async function upsertDirectory(u: DirectoryUser): Promise<void> {
  const email = u.email.trim().toLowerCase();
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: emailPk(email), SK: DIRECTORY_SK, userId: u.userId, email, name: u.name } }));
}

export async function lookupByEmail(email: string): Promise<DirectoryUser | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: emailPk(email), SK: DIRECTORY_SK } }));
  return r.Item ? { userId: r.Item.userId as string, email: r.Item.email as string, name: r.Item.name as string } : null;
}

// Is this display name already held by a *different* user?
export async function isUsernameTaken(name: string, exceptUserId: string): Promise<boolean> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: usernamePk(name), SK: DIRECTORY_SK } }));
  return !!r.Item && r.Item.userId !== exceptUserId;
}

// Claim a display name for a user. Throws { taken:true } if another user holds
// it; re-claiming your own name is a no-op success.
export async function reserveUsername(name: string, userId: string): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: usernamePk(name), SK: DIRECTORY_SK, userId, name: name.trim() },
      ConditionExpression: "attribute_not_exists(PK) OR userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }));
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") { const err: any = new Error("username taken"); err.taken = true; throw err; }
    throw e;
  }
}

// Release a name reservation, but only if it belongs to this user.
export async function releaseUsername(name: string, userId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: usernamePk(name), SK: DIRECTORY_SK },
      ConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }));
  } catch (e: any) {
    if (e?.name !== "ConditionalCheckFailedException") throw e; // not ours / gone: fine
  }
}
