import { HttpError } from "./http.js";
import type { Network } from "./types.js";

// Caps on a single network — mirror of src/api/limits.js. Keep the two in sync.
// These bound storage/read cost and keep us clear of DynamoDB's 400KB item cap.
export const LIMITS = {
  bytes: 300 * 1024,
  nodes: 2000,
  edges: 8000,
  nodeTypes: 60,
  title: 200,
  description: 4000,
  tags: 12,
  tagLen: 40,
  label: 300,
  notes: 8000,
  netsPerUser: 500,
};

export function validateNetwork(net: Network): void {
  if (!net || typeof net !== "object") throw new HttpError(400, "Invalid network.");
  const nodes = Array.isArray(net.nodes) ? net.nodes : [];
  const edges = Array.isArray(net.edges) ? net.edges : [];
  const types = Array.isArray(net.nodeTypes) ? net.nodeTypes : [];
  if (nodes.length > LIMITS.nodes) throw new HttpError(400, `Too many nodes (max ${LIMITS.nodes}).`);
  if (edges.length > LIMITS.edges) throw new HttpError(400, `Too many connections (max ${LIMITS.edges}).`);
  if (types.length > LIMITS.nodeTypes) throw new HttpError(400, `Too many node types (max ${LIMITS.nodeTypes}).`);
  if ((net.title || "").length > LIMITS.title) throw new HttpError(400, "Title is too long.");
  if ((net.description || "").length > LIMITS.description) throw new HttpError(400, "Description is too long.");
  if (Array.isArray(net.tags) && (net.tags.length > LIMITS.tags || net.tags.some((t) => (t || "").length > LIMITS.tagLen)))
    throw new HttpError(400, "Too many or too-long tags.");
  for (const n of nodes) {
    if ((n?.label || "").length > LIMITS.label) throw new HttpError(400, "A node topic is too long.");
    if ((n?.notes || "").length > LIMITS.notes) throw new HttpError(400, "A node statement is too long.");
  }
  for (const e of edges) {
    if ((e?.label || "").length > LIMITS.label) throw new HttpError(400, "An edge label is too long.");
  }
  // Backstop: total serialized size, also our margin under the 400KB item cap.
  if (JSON.stringify(net).length > LIMITS.bytes) throw new HttpError(400, "This network is too large to save.");
}
