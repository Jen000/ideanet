import { useMemo } from "react";

/* ------------------------------------------------------------------ graph ops */
export function useGraphIndex(net) {
  return useMemo(() => {
    const byId = {};
    net.nodes.forEach((n) => (byId[n.id] = n));
    const typeById = {};
    net.nodeTypes.forEach((t) => (typeById[t.id] = t));
    const neighbors = {};
    const children = {};
    net.nodes.forEach((n) => {
      neighbors[n.id] = new Set();
      children[n.id] = [];
    });
    net.edges.forEach((e) => {
      if (!neighbors[e.source] || !neighbors[e.target]) return;
      neighbors[e.source].add(e.target);
      neighbors[e.target].add(e.source);
      children[e.source].push(e.target);
    });
    return { byId, typeById, neighbors, children };
  }, [net]);
}

export function hiddenByCollapse(net, children) {
  const hidden = new Set();
  net.nodes.filter((n) => n.collapsed).forEach((root) => {
    const stack = [...(children[root.id] || [])];
    const seen = new Set([root.id]);
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      hidden.add(id);
      (children[id] || []).forEach((c) => stack.push(c));
    }
  });
  return hidden;
}

export function radialLayout(net) {
  const incoming = {};
  net.nodes.forEach((n) => (incoming[n.id] = 0));
  net.edges.forEach((e) => (incoming[e.target] = (incoming[e.target] || 0) + 1));
  const roots = net.nodes.filter((n) => !incoming[n.id]).map((n) => n.id);
  const start = roots.length ? roots : [net.nodes[0]?.id].filter(Boolean);
  const level = {};
  const queue = start.map((id) => [id, 0]);
  const seen = new Set(start);
  const kids = {};
  net.edges.forEach((e) => (kids[e.source] = [...(kids[e.source] || []), e.target]));
  while (queue.length) {
    const [id, d] = queue.shift();
    level[id] = d;
    (kids[id] || []).forEach((c) => {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push([c, d + 1]);
      }
    });
  }
  net.nodes.forEach((n) => (level[n.id] = level[n.id] ?? 1));
  const rings = {};
  net.nodes.forEach((n) => (rings[level[n.id]] = [...(rings[level[n.id]] || []), n.id]));
  const pos = {};
  Object.entries(rings).forEach(([d, ids]) => {
    const depth = Number(d);
    const r = depth === 0 ? 0 : 170 + (depth - 1) * 165;
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      pos[id] = depth === 0
        ? { x: 520 + (ids.length > 1 ? (i - (ids.length - 1) / 2) * 260 : 0), y: 360 }
        : { x: 520 + Math.cos(a) * r * 1.35, y: 360 + Math.sin(a) * r };
    });
  });
  return { ...net, nodes: net.nodes.map((n) => ({ ...n, ...pos[n.id] })) };
}
