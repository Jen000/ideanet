import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./dynamo.js";
import { publicPk, PUBLIC_SK, GSI_PUBLIC_PK } from "./keys.js";
import { summarize, gsiSk, score } from "./summary.js";
import type { Network } from "./types.js";

export interface PublicItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  ownerId: string;
  net: Network;
  summary: ReturnType<typeof summarize>;
  likes: number;
  views: number;
  score: number;
}

export async function getPublic(netId: string): Promise<PublicItem | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: publicPk(netId), SK: PUBLIC_SK } }));
  return (r.Item as PublicItem) ?? null;
}

// Publish or re-publish. Likes/views are preserved across edits by the caller
// passing the existing counts in.
export async function putPublicCopy(net: Network, likes: number, views: number): Promise<void> {
  const counts = { likes, views, updatedAt: net.updatedAt };
  const item: PublicItem = {
    PK: publicPk(net.id),
    SK: PUBLIC_SK,
    GSI1PK: GSI_PUBLIC_PK,
    GSI1SK: gsiSk(counts, net.id),
    ownerId: net.ownerId,
    net: { ...net, likes, views },
    summary: summarize({ ...net, likes, views }),
    likes,
    views,
    score: score(counts),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function deletePublicCopy(netId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: publicPk(netId), SK: PUBLIC_SK } }));
}

// After a like or a view rollup changes the counts, recompute the ranking key
// so the gallery ordering follows. Gallery reads the live top-level likes/views
// attributes, so those don't need to be mirrored into summary here.
export async function refreshRanking(netId: string, counts: { likes: number; views: number; updatedAt: number }): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: publicPk(netId), SK: PUBLIC_SK },
      UpdateExpression: "SET GSI1SK = :sk, #score = :sc",
      ExpressionAttributeNames: { "#score": "score" }, // defensive: alias against reserved-word collisions
      ExpressionAttributeValues: { ":sk": gsiSk(counts, netId), ":sc": score(counts) },
      ConditionExpression: "attribute_exists(PK)",
    })
  );
}
