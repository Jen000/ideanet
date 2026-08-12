/**
 * Caps on a single network, to keep one user (or a bot) from creating enormous
 * documents that bloat storage, slow reads, or blow past DynamoDB's 400KB item
 * limit. The AWS backend enforces the same caps in
 * infra/lambda/shared/validate.ts — keep the two in sync.
 */
export const LIMITS = {
  bytes: 300 * 1024, // serialized network; also our margin under DynamoDB's 400KB item cap
  nodes: 2000,
  edges: 8000,
  nodeTypes: 60,
  title: 200,
  description: 4000,
  tags: 12,
  tagLen: 40,
  label: 300, // node topic / edge label
  notes: 8000, // node statement
  netsPerUser: 500,
};

// Throws an Error with a user-facing message when a network exceeds a cap.
export function validateNetwork(net) {
  if (!net || typeof net !== "object") throw new Error("Invalid network.");
  const nodes = Array.isArray(net.nodes) ? net.nodes : [];
  const edges = Array.isArray(net.edges) ? net.edges : [];
  const types = Array.isArray(net.nodeTypes) ? net.nodeTypes : [];
  if (nodes.length > LIMITS.nodes) throw new Error(`Too many nodes (max ${LIMITS.nodes}).`);
  if (edges.length > LIMITS.edges) throw new Error(`Too many connections (max ${LIMITS.edges}).`);
  if (types.length > LIMITS.nodeTypes) throw new Error(`Too many node types (max ${LIMITS.nodeTypes}).`);
  if ((net.title || "").length > LIMITS.title) throw new Error("Title is too long.");
  if ((net.description || "").length > LIMITS.description) throw new Error("Description is too long.");
  if (Array.isArray(net.tags) && (net.tags.length > LIMITS.tags || net.tags.some((t) => (t || "").length > LIMITS.tagLen)))
    throw new Error("Too many or too-long tags.");
  for (const n of nodes) {
    if ((n?.label || "").length > LIMITS.label) throw new Error("A node topic is too long.");
    if ((n?.notes || "").length > LIMITS.notes) throw new Error("A node statement is too long.");
  }
  for (const e of edges) {
    if ((e?.label || "").length > LIMITS.label) throw new Error("An edge label is too long.");
  }
  // Backstop: total serialized size (keeps us under the 400KB item cap).
  if (JSON.stringify(net).length > LIMITS.bytes) throw new Error("This network is too large to save.");
}
