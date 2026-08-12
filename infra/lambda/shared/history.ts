import { QueryCommand, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, TABLE } from "./dynamo.js";
import { histPk, histSk } from "./keys.js";
import type { Network } from "./types.js";

const MAX_SNAPSHOTS = 20;
const THROTTLE_MS = 30_000; // during continuous editing, snapshot at most this often

export interface SnapshotMeta {
  id: string;
  at: number;
  by: string; // who replaced this version
  nodeCount: number;
}

// Record the state that is about to be replaced, tagged with who is replacing
// it, so an owner can roll back a bad edit. Throttled (skips if a snapshot was
// taken very recently) unless `force`, and pruned to the most recent few.
export async function snapshotNet(netId: string, net: Network, by: string, byId: string, force = false): Promise<void> {
  if (!force) {
    const latest = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": histPk(netId) },
        ScanIndexForward: false,
        Limit: 1,
        ProjectionExpression: "#a",
        ExpressionAttributeNames: { "#a": "at" },
      })
    );
    const lastAt = (latest.Items?.[0]?.at as number) ?? 0;
    if (Date.now() - lastAt < THROTTLE_MS) return;
  }

  const at = Date.now();
  const sk = histSk(at, randomUUID());
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: histPk(netId), SK: sk, at, by, byId, net } }));

  // Prune anything past the cap (oldest first).
  const all = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": histPk(netId) },
      ScanIndexForward: false,
      ProjectionExpression: "SK",
    })
  );
  for (const old of (all.Items ?? []).slice(MAX_SNAPSHOTS)) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: histPk(netId), SK: old.SK as string } }));
  }
}

// Metadata for the history list — no net bodies, so the response stays small.
export async function listHistory(netId: string): Promise<SnapshotMeta[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": histPk(netId) },
      ScanIndexForward: false, // newest first
    })
  );
  return (r.Items ?? []).map((i) => ({
    id: i.SK as string,
    at: i.at as number,
    by: i.by as string,
    nodeCount: ((i.net as Network)?.nodes?.length ?? 0) as number,
  }));
}

export async function getSnapshot(netId: string, snapshotId: string): Promise<{ net: Network } | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: histPk(netId), SK: snapshotId } }));
  if (!r.Item) return null;
  return { net: r.Item.net as Network };
}

export async function deleteHistory(netId: string): Promise<void> {
  const all = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": histPk(netId) },
      ProjectionExpression: "SK",
    })
  );
  for (const it of all.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: histPk(netId), SK: it.SK as string } }));
  }
}
