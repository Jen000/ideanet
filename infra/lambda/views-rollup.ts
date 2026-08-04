import type { SQSHandler } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./shared/dynamo.js";
import { publicPk, PUBLIC_SK } from "./shared/keys.js";
import { refreshRanking } from "./shared/public.js";
import type { Network } from "./shared/types.js";

// Drains the view-event queue: one message = one open of a public network.
// We aggregate per network so a batch of N views becomes a single ADD, then
// refresh the ranking key once. This is the "buffer + rollup" side of the
// eventually-consistent view counter.
export const handler: SQSHandler = async (event) => {
  const counts = new Map<string, number>();
  for (const record of event.Records) {
    try {
      const { netId } = JSON.parse(record.body) as { netId?: string };
      if (netId) counts.set(netId, (counts.get(netId) ?? 0) + 1);
    } catch {
      /* skip malformed message */
    }
  }

  for (const [netId, n] of counts) {
    try {
      const upd = await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: publicPk(netId), SK: PUBLIC_SK },
          UpdateExpression: "ADD #v :n",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeNames: { "#v": "views" },
          ExpressionAttributeValues: { ":n": n },
          ReturnValues: "ALL_NEW",
        })
      );
      const views = (upd.Attributes?.views as number) ?? 0;
      const likes = (upd.Attributes?.likes as number) ?? 0;
      const net = upd.Attributes?.net as Network;
      await refreshRanking(netId, { likes, views, updatedAt: net?.updatedAt ?? Date.now() });
    } catch (err: any) {
      // Network was unpublished between the read and the rollup — drop the views.
      if (err?.name === "ConditionalCheckFailedException") continue;
      throw err; // real failure: let SQS retry / DLQ
    }
  }
};
