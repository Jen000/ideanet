// Server-side copies of summarize()/score() from src/api/local.js. The two
// must stay in agreement: the gallery ranks with score() and lists with
// summarize(), exactly as the local adapter does.
import type { Network, Summary } from "./types.js";

const now = () => Date.now();

export const summarize = (n: Network): Summary => ({
  id: n.id,
  title: n.title,
  description: n.description,
  tags: n.tags,
  author: n.ownerName,
  likes: n.likes || 0,
  views: n.views || 0,
  visibility: n.visibility,
  nodeCount: n.nodes.length,
  updatedAt: n.updatedAt,
  preview: {
    nodes: n.nodes.map((x) => ({ x: x.x, y: x.y, t: x.typeId })),
    edges: n.edges.map((e) => [e.source, e.target]),
    ids: n.nodes.map((x) => x.id),
    types: n.nodeTypes,
  },
});

// "Popular" = likes weighted over raw views, with a mild recency lift.
export const score = (s: { likes?: number; views?: number; updatedAt?: number }) =>
  (s.likes || 0) * 8 + (s.views || 0) + Math.max(0, 14 - (now() - (s.updatedAt || 0)) / 86400000);

// GSI1SK must sort lexicographically the same way score sorts numerically, so
// the integer part is zero-padded to a fixed width. Highest score first is a
// descending (ScanIndexForward=false) query.
export const gsiSk = (s: { likes?: number; views?: number; updatedAt?: number }, netId: string) => {
  const n = Math.max(0, Math.round(score(s)));
  return `${String(n).padStart(12, "0")}#${netId}`;
};
