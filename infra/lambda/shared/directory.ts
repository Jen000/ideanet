import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./dynamo.js";
import { emailPk, DIRECTORY_SK } from "./keys.js";

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
