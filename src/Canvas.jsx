import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MONO, DEFAULT_TYPES, uid, clamp } from "./constants";
import { useGraphIndex, hiddenByCollapse } from "./graph";

/* ================================================================== CANVAS */
export default function Canvas({ net, onChange, readOnly, selected, setSelected, centerOnSelect, activeTypeId, onNodeCreate }) {
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [view3d, setView3d] = useState(true);           // tilted perspective on by default
  const [rot, setRot] = useState({ yaw: -0.62, pitch: 0.5 }); // camera orbit angles
  const [live, setLive] = useState(null); // in-progress connection
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  const tween = useRef(null);
  const { byId, typeById, neighbors, children } = useGraphIndex(net);
  const hidden = useMemo(() => hiddenByCollapse(net, children), [net, children]);

  const typeOf = (n) => typeById[n.typeId] || net.nodeTypes[0] || DEFAULT_TYPES[1];

  // The topic sits on the shape, so a node grows just enough to hold it (its
  // type size is the floor). Computed once per node so edges terminate on the
  // real border, not the bare type size.
  const radii = useMemo(() => {
    const m = {};
    for (const n of net.nodes) m[n.id] = nodeRadius(n.label, typeOf(n));
    return m;
    /* eslint-disable-next-line */
  }, [net.nodes, net.nodeTypes]);
  const radiusOf = (n) => radii[n.id] ?? typeOf(n).size;

  /* -------------------------------------------------------------- 3d layout
     Nodes keep the (x,y) the user arranged; we synthesise a depth (z) from the
     graph so the figure gains volume and edges land on different planes instead
     of criss-crossing on one flat sheet. Depth follows graph distance from the
     most-connected node (a bowl from the core outward), with a stable per-node
     jitter so siblings aren't perfectly coplanar. Nothing here is persisted. */
  const solid = useMemo(() => {
    const nodes = net.nodes;
    if (!nodes.length) return { z: {}, cx: 0, cy: 0, cz: 0 };
    const z = graphDepths(net);
    let cx = 0, cy = 0, cz = 0;
    for (const n of nodes) { cx += n.x; cy += n.y; cz += z[n.id] || 0; }
    cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
    return { z, cx, cy, cz };
  }, [net.nodes, net.edges]);

  const FOCAL = 1250; // perspective focal length; larger = flatter
  // Project a node into outer-<g> space (which pan/zoom then transforms). In 2D
  // mode this is the identity, so every downstream calc is mode-agnostic.
  const proj = useMemo(() => {
    const m = {};
    if (!view3d) {
      for (const n of net.nodes) m[n.id] = { x: n.x, y: n.y, s: 1, depth: 0 };
      return m;
    }
    const { z, cx, cy, cz } = solid;
    const cyaw = Math.cos(rot.yaw), syaw = Math.sin(rot.yaw);
    const cpit = Math.cos(rot.pitch), spit = Math.sin(rot.pitch);
    for (const n of net.nodes) {
      const dx = n.x - cx, dy = n.y - cy, dz = (z[n.id] || 0) - cz;
      // yaw about the vertical axis (mixes x & z), then pitch about horizontal
      const x1 = dx * cyaw + dz * syaw;
      const z1 = -dx * syaw + dz * cyaw;
      const y2 = dy * cpit - z1 * spit;
      const z2 = dy * spit + z1 * cpit;   // +z2 = toward the camera
      const s = FOCAL / Math.max(300, FOCAL - z2);
      m[n.id] = { x: cx + x1 * s, y: cy + y2 * s, s, depth: z2 };
    }
    return m;
  }, [net.nodes, solid, rot, view3d]);

  const P = useCallback((n) => proj[n.id] || { x: n.x, y: n.y, s: 1, depth: 0 }, [proj]);

  // Depth range → a fog factor so far nodes/edges recede and near ones pop.
  const fog = useMemo(() => {
    if (!view3d) return () => 1;
    let lo = Infinity, hi = -Infinity;
    for (const n of net.nodes) { const d = P(n).depth; if (d < lo) lo = d; if (d > hi) hi = d; }
    if (!(hi - lo > 1)) return () => 1;
    return (d) => 0.4 + 0.6 * ((d - lo) / (hi - lo));
  }, [view3d, net.nodes, P]);

  const toWorld = useCallback((cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  }, [view]);

  /* eased viewport tween — used by centre-on-select and fit */
  const glideTo = useCallback((target) => {
    if (tween.current) cancelAnimationFrame(tween.current.raf);
    const from = { ...view };
    const t0 = performance.now();
    const dur = 520;
    const step = (t) => {
      const p = clamp((t - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
      if (p < 1) tween.current = { raf: requestAnimationFrame(step) };
    };
    tween.current = { raf: requestAnimationFrame(step) };
  }, [view]);

  const centerNode = useCallback((id) => {
    const n = byId[id];
    const el = svgRef.current;
    if (!n || !el) return;
    const p = P(n);
    const r = el.getBoundingClientRect();
    const k = clamp(view.k, 0.75, 1.3);
    glideTo({ k, x: r.width / 2 - p.x * k, y: r.height / 2 - p.y * k });
  }, [byId, view.k, glideTo, P]);

  const fit = useCallback(() => {
    const el = svgRef.current;
    if (!el || !net.nodes.length) return;
    const r = el.getBoundingClientRect();
    const xs = net.nodes.map((n) => P(n).x), ys = net.nodes.map((n) => P(n).y);
    const pad = 120;
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys) + pad * 2);
    const k = clamp(Math.min(r.width / w, r.height / h), 0.2, 1.6);
    glideTo({ k, x: r.width / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * k, y: r.height / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2) * k });
  }, [net.nodes, glideTo, P]);

  useEffect(() => { const t = setTimeout(fit, 60); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [net.id]);
  // Reframe when flipping between flat and tilted so the figure stays centred.
  useEffect(() => { const t = setTimeout(fit, 30); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [view3d]);
  useEffect(() => {
    if (centerOnSelect && selected?.kind === "node") centerNode(selected.id);
    /* eslint-disable-next-line */
  }, [selected?.id]);

  /* zoom */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      setView((v) => {
        const k = clamp(v.k * Math.exp(-ev.deltaY * 0.0016), 0.2, 3);
        const s = k / v.k;
        return { k, x: px - (px - v.x) * s, y: py - (py - v.y) * s };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Hit-test against projected centres, allowing for perspective-scaled radius.
  const nodeAt = (wx, wy) =>
    net.nodes.filter((n) => !hidden.has(n.id)).find((n) => {
      const p = P(n);
      return Math.hypot(p.x - wx, p.y - wy) <= radiusOf(n) * p.s + 6;
    });

  const onPointerDown = (ev) => {
    if (ev.button !== 0) return;
    // In 3D a plain drag orbits the figure; Shift-drag pans. In 2D it always pans.
    if (view3d && !ev.shiftKey) {
      drag.current = { mode: "orbit", sx: ev.clientX, sy: ev.clientY, yaw: rot.yaw, pitch: rot.pitch, moved: false };
    } else {
      drag.current = { mode: "pan", sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y, moved: false };
    }
    svgRef.current.setPointerCapture(ev.pointerId);
  };

  const startNodeDrag = (ev, n) => {
    ev.stopPropagation();
    setSelected({ kind: "node", id: n.id });
    if (readOnly) return;
    // Repositioning happens on the flat plane; in 3D a node press just selects.
    if (view3d) return;
    const w = toWorld(ev.clientX, ev.clientY);
    drag.current = { mode: "node", id: n.id, dx: n.x - w.x, dy: n.y - w.y, moved: false };
    svgRef.current.setPointerCapture(ev.pointerId);
  };

  const startConnect = (ev, n) => {
    ev.stopPropagation();
    if (readOnly) return;
    const w = toWorld(ev.clientX, ev.clientY);
    drag.current = { mode: "connect", from: n.id };
    setLive({ from: n.id, x: w.x, y: w.y });
    svgRef.current.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.mode === "orbit") {
      const yaw = d.yaw + (ev.clientX - d.sx) * 0.006;
      const pitch = clamp(d.pitch - (ev.clientY - d.sy) * 0.006, -1.35, 1.35);
      setRot({ yaw, pitch });
    } else if (d.mode === "pan") {
      setView((v) => ({ ...v, x: d.ox + (ev.clientX - d.sx), y: d.oy + (ev.clientY - d.sy) }));
    } else if (d.mode === "node") {
      const w = toWorld(ev.clientX, ev.clientY);
      onChange({ ...net, nodes: net.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(w.x + d.dx), y: Math.round(w.y + d.dy) } : n)) });
    } else if (d.mode === "connect") {
      const w = toWorld(ev.clientX, ev.clientY);
      setLive({ from: d.from, x: w.x, y: w.y });
    }
  };

  const onPointerUp = (ev) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "connect") {
      const w = toWorld(ev.clientX, ev.clientY);
      const target = nodeAt(w.x, w.y);
      const src = byId[d.from];
      setLive(null);
      if (target) {
        // dropped on a node → link the two (unless it'd duplicate an edge)
        if (target.id !== d.from && !net.edges.some((e) => e.source === d.from && e.target === target.id)) {
          onChange({ ...net, edges: [...net.edges, { id: uid("e"), source: d.from, target: target.id, label: "", directed: true }] });
        }
      } else if (src) {
        const sp = P(src);
        // connected node. In 3D we offset from the source in the flat plane so
        // its placement stays predictable; in 2D it lands under the cursor.
        if (Math.hypot(w.x - sp.x, w.y - sp.y) > radiusOf(src) * sp.s + 24) {
          const id = uid();
          const typeId = activeTypeId && typeById[activeTypeId] ? activeTypeId : src.typeId || net.nodeTypes[0].id;
          const pos = view3d
            ? { x: Math.round(src.x + 150), y: Math.round(src.y + 40) }
            : { x: Math.round(w.x), y: Math.round(w.y) };
          onChange({
            ...net,
            nodes: [...net.nodes, { id, label: "New node", typeId, notes: "", ...pos, collapsed: false }],
            edges: [...net.edges, { id: uid("e"), source: d.from, target: id, label: "", directed: true }],
          });
          setSelected({ kind: "node", id });
          onNodeCreate?.();
        }
      }
      return;
    }
    if ((d.mode === "pan" || d.mode === "orbit") && !d.moved) setSelected(null);
  };

  const onDoubleClick = (ev) => {
    if (readOnly) return;
    const w = toWorld(ev.clientX, ev.clientY);
    if (nodeAt(w.x, w.y)) return;
    const id = uid();
    // In 3D the cursor→plane mapping isn't 1:1, so drop near the figure's centre.
    const pos = view3d
      ? { x: Math.round(solid.cx + (Math.random() - 0.5) * 120), y: Math.round(solid.cy + (Math.random() - 0.5) * 120) }
      : { x: Math.round(w.x), y: Math.round(w.y) };
    onChange({
      ...net,
      nodes: [...net.nodes, { id, label: "New node", typeId: activeTypeId || net.nodeTypes[0].id, notes: "", ...pos, collapsed: false }],
    });
    setSelected({ kind: "node", id });
    onNodeCreate?.();
  };

  const focus = selected?.kind === "node" ? selected.id : null;
  const lit = focus ? new Set([focus, ...(neighbors[focus] || [])]) : null;
  const dim = (id) => (lit && !lit.has(id) ? 0.16 : 1);

  // Painter's order: far things first so near ones overlap them.
  const drawEdges = useMemo(() => {
    const es = net.edges.filter((e) => byId[e.source] && byId[e.target] && !hidden.has(e.source) && !hidden.has(e.target));
    if (!view3d) return es;
    return [...es].sort((a, b) => (P(byId[a.source]).depth + P(byId[a.target]).depth) - (P(byId[b.source]).depth + P(byId[b.target]).depth));
  }, [net.edges, byId, hidden, view3d, P]);

  const drawNodes = useMemo(() => {
    const ns = net.nodes.filter((n) => !hidden.has(n.id));
    if (!view3d) return ns;
    return [...ns].sort((a, b) => P(a).depth - P(b).depth);
  }, [net.nodes, hidden, view3d, P]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full touch-none"
        style={{ cursor: view3d ? "move" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <marker id="ah-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#3d5a68" />
          </marker>
          <marker id="ah-lit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#00f0ff" />
          </marker>
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {drawEdges.map((e) => {
            const a = byId[e.source], b = byId[e.target];
            const pa = P(a), pb = P(b);
            const on = lit ? lit.has(a.id) && lit.has(b.id) : false;
            const sel = selected?.kind === "edge" && selected.id === e.id;
            const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
            const ra = radiusOf(a) * pa.s + 4, rb = radiusOf(b) * pb.s + 10;
            const x1 = pa.x + Math.cos(ang) * ra, y1 = pa.y + Math.sin(ang) * ra;
            const x2 = pb.x - Math.cos(ang) * rb, y2 = pb.y - Math.sin(ang) * rb;
            const bright = on || sel;
            const f = fog((pa.depth + pb.depth) / 2);
            const base = lit ? (on ? 1 : 0.1) : 0.85;
            return (
              <g key={e.id} style={{ opacity: base * (bright ? 1 : f), transition: "opacity 320ms ease" }}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={bright ? "#00f0ff" : "#2f4a57"}
                  strokeWidth={bright ? 1.9 : 1.1}
                  markerEnd={e.directed ? (bright ? "url(#ah-lit)" : "url(#ah-dim)") : undefined}
                  style={{ transition: "stroke 320ms ease, stroke-width 320ms ease", filter: bright ? "drop-shadow(0 0 4px rgba(0,240,255,.55))" : "none" }}
                />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"
                  style={{ cursor: "pointer" }}
                  onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ kind: "edge", id: e.id }); }} />
                {e.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle"
                    style={{ fontFamily: MONO, fontSize: 9, fill: bright ? "#9fe9f5" : "#5b7885", pointerEvents: "none" }}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {live && byId[live.from] && (
            <line x1={P(byId[live.from]).x} y1={P(byId[live.from]).y} x2={live.x} y2={live.y}
              stroke="#00f0ff" strokeWidth="1.6" strokeDasharray="5 5" opacity="0.8" />
          )}

          {drawNodes.map((n) => {
            const t = typeOf(n);
            const isSel = focus === n.id;
            const r = radiusOf(n);
            const p = P(n);
            const kidCount = (children[n.id] || []).filter((c) => byId[c]).length;
            const fs = 10;
            const lh = fs * 1.18;
            const lines = wrapLabel(n.label, lineChars(t.size), 2);
            const y0 = -((lines.length - 1) / 2) * lh;
            const f = fog(p.depth);
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y}) scale(${p.s})`}
                style={{ opacity: dim(n.id) * (isSel ? 1 : f), transition: "opacity 340ms ease", cursor: "pointer" }}
                onPointerDown={(ev) => startNodeDrag(ev, n)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}>
                <ShapeBody shape={t.shape} r={r} fill="rgba(6,12,18,0.88)" stroke={t.color} strokeWidth={isSel ? 2.6 : 2}
                  style={{
                    filter: `drop-shadow(0 0 ${isSel ? 14 : 7}px ${t.color})`,
                    transition: "stroke-width 300ms ease, filter 300ms ease",
                    animation: isSel ? "np 1.7s ease-in-out infinite" : "none",
                  }} />
                <text textAnchor="middle" dominantBaseline="middle"
                  style={{ fontFamily: MONO, fontSize: fs, fontWeight: isSel ? 600 : 500, fill: isSel ? "#eafeff" : "#d3edf4", pointerEvents: "none", textShadow: isSel ? `0 0 8px ${t.color}` : `0 1px 3px rgba(0,0,0,.85)` }}>
                  {lines.map((ln, i) => (
                    <tspan key={i} x="0" y={y0 + i * lh}>{ln}</tspan>
                  ))}
                </text>
                {n.notes && (
                  <g transform={`translate(${r * 0.72},${-r * 0.72})`} style={{ pointerEvents: "none" }}>
                    <circle r="6" fill="rgba(6,12,18,.96)" stroke={t.color} strokeWidth="1.1" />
                    <line x1="-2.6" y1="-1.4" x2="2.6" y2="-1.4" stroke={t.color} strokeWidth="1" strokeLinecap="round" />
                    <line x1="-2.6" y1="0.3" x2="2.6" y2="0.3" stroke={t.color} strokeWidth="1" strokeLinecap="round" />
                    <line x1="-2.6" y1="2" x2="1" y2="2" stroke={t.color} strokeWidth="1" strokeLinecap="round" />
                  </g>
                )}
                {kidCount > 0 && (
                  <g transform={`translate(0,${r + 22})`} onPointerDown={(ev) => { ev.stopPropagation(); onChange({ ...net, nodes: net.nodes.map((m) => (m.id === n.id ? { ...m, collapsed: !m.collapsed } : m)) }); }}>
                    <circle r="7.5" fill="rgba(6,12,18,.95)" stroke={t.color} strokeWidth="1.2" opacity="0.85" />
                    <text textAnchor="middle" y="3.2" style={{ fontFamily: MONO, fontSize: 9, fill: t.color, pointerEvents: "none" }}>
                      {n.collapsed ? kidCount : "–"}
                    </text>
                  </g>
                )}
                {!readOnly && (hover === n.id || isSel) && (
                  <g transform={`translate(${r + 11},0)`} style={{ cursor: "crosshair" }}
                    onPointerDown={(ev) => startConnect(ev, n)}>
                    <title>Drag to a node to link them, or to empty space to add a connected node</title>
                    <circle r="7" fill="#050a0e" stroke="#00f0ff" strokeWidth="1.4" style={{ filter: "drop-shadow(0 0 5px #00f0ff)" }} />
                    <line x1="-3.2" y1="0" x2="3.2" y2="0" stroke="#00f0ff" strokeWidth="1.3" strokeLinecap="round" style={{ pointerEvents: "none" }} />
                    <line x1="0" y1="-3.2" x2="0" y2="3.2" stroke="#00f0ff" strokeWidth="1.3" strokeLinecap="round" style={{ pointerEvents: "none" }} />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <CanvasBtn active={view3d} onClick={() => setView3d((v) => !v)}
          title={view3d ? "Switch to the flat 2D view" : "Tilt into the 3D view"}>{view3d ? "3D" : "2D"}</CanvasBtn>
        <CanvasBtn onClick={fit}>fit</CanvasBtn>
        <CanvasBtn onClick={() => glideTo({ ...view, k: clamp(view.k * 1.25, 0.2, 3) })}>+</CanvasBtn>
        <CanvasBtn onClick={() => glideTo({ ...view, k: clamp(view.k / 1.25, 0.2, 3) })}>–</CanvasBtn>
      </div>

      {view3d && (
        <div className="absolute bottom-3 left-3 text-[9px] pointer-events-none"
          style={{ fontFamily: MONO, color: "#3f5f6c" }}>
          drag to orbit · shift-drag to pan · switch to 2D to move nodes
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- node shapes
   All shapes are drawn to fit inside a bounding radius r, so edge geometry and
   hit-testing can treat every node as a circle of that radius. Unknown/missing
   shapes fall back to a circle (older data). */
function ShapeBody({ shape, r, fill, stroke, strokeWidth, style }) {
  const p = { fill, stroke, strokeWidth, style };
  if (shape === "square") {
    const s = r * 0.9;
    return <rect x={-s} y={-s} width={2 * s} height={2 * s} rx={Math.max(2, s * 0.18)} {...p} />;
  }
  if (shape === "diamond") {
    const d = r * 1.15;
    return <polygon points={`0,${-d} ${d},0 0,${d} ${-d},0`} {...p} />;
  }
  if (shape === "hexagon") {
    return <polygon points={polyPoints(6, r * 1.06)} {...p} />;
  }
  // circle keeps the eased radius transition it always had
  return (
    <circle r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
      style={{ ...style, transition: `r 300ms cubic-bezier(.2,.8,.2,1), ${style?.transition || ""}` }} />
  );
}

function polyPoints(sides, R) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI / 180) * ((360 / sides) * i - 90);
    pts.push(`${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/* ------------------------------------------------------------------- depth
   A stable per-node z synthesised from the graph. BFS layers out from the
   highest-degree node of each component give a tiered "bowl", and a hashed
   jitter keeps same-layer siblings off one perfectly flat plane so their
   edges separate in depth. Pure function of the graph — never persisted. */
function graphDepths(net) {
  const adj = {};
  net.nodes.forEach((n) => (adj[n.id] = []));
  net.edges.forEach((e) => {
    if (adj[e.source] && adj[e.target]) { adj[e.source].push(e.target); adj[e.target].push(e.source); }
  });
  const layer = {};
  const seen = new Set();
  const seeds = [...net.nodes].sort((a, b) => adj[b.id].length - adj[a.id].length);
  for (const seed of seeds) {
    if (seen.has(seed.id)) continue;
    layer[seed.id] = 0; seen.add(seed.id);
    let q = [seed.id];
    while (q.length) {
      const cur = q.shift();
      for (const nb of adj[cur]) if (!seen.has(nb)) { seen.add(nb); layer[nb] = layer[cur] + 1; q.push(nb); }
    }
  }
  const maxL = Math.max(0, ...Object.values(layer));
  const SPACING = 150;
  const z = {};
  for (const n of net.nodes) {
    const L = layer[n.id] ?? 0;
    const j = (hash01(n.id) - 0.5) * SPACING * 0.55; // ± keeps siblings non-coplanar
    z[n.id] = (L - maxL / 2) * SPACING + j;
  }
  return z;
}

// Deterministic 0..1 hash of a string, so a node's jitter is stable across renders.
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/* ---------------------------------------------------------------- label wrap
   The topic renders on the shape. We wrap to at most `maxLines`, prefer wrapping
   over widening, and ellipsize anything that still doesn't fit — the full text
   lives in the node's notes/statement in the side panel. */
const lineChars = (size) => clamp(Math.round(size / 3.4) + 4, 7, 15);

function wrapLabel(text, maxChars, maxLines) {
  const t = (text || "").trim();
  if (!t) return [""];
  const words = t.split(/\s+/);
  const lines = [];
  let cur = "";
  const flush = () => { if (cur !== "") { lines.push(cur); cur = ""; } };
  for (let w of words) {
    // hard-break a single word longer than a line
    while (w.length > maxChars) {
      flush();
      if (lines.length >= maxLines) break;
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (lines.length >= maxLines) { cur = ""; break; }
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { flush(); if (lines.length >= maxLines) break; cur = w; }
  }
  flush();
  const out = lines.slice(0, maxLines);

  // ellipsize the last visible line if anything was dropped
  const kept = out.join(" ").replace(/\s+/g, "").length;
  if (kept < t.replace(/\s+/g, "").length && out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last).replace(/\s+$/, "") + "…";
  }
  return out.length ? out : [""];
}

// Bounding radius that fits the topic, with the type size as the floor.
function nodeRadius(label, t) {
  const fs = 10;
  const lines = wrapLabel(label, lineChars(t.size), 2);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const textR = Math.max(longest * fs * 0.31, (lines.length * fs * 1.18) / 2) + 10;
  return Math.max(t.size, textR);
}

const CanvasBtn = ({ children, onClick, active, title }) => (
  <button onClick={onClick} title={title}
    className="w-8 h-8 rounded border text-xs"
    style={{ fontFamily: MONO, background: active ? "rgba(0,240,255,.14)" : "rgba(8,14,20,.8)", borderColor: active ? "rgba(0,240,255,.6)" : "rgba(0,240,255,.25)", color: active ? "#aef4ff" : "#7fd4e2" }}>
    {children}
  </button>
);
