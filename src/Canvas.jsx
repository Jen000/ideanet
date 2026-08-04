import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MONO, DEFAULT_TYPES, uid, clamp } from "./constants";
import { useGraphIndex, hiddenByCollapse } from "./graph";

/* ================================================================== CANVAS */
export default function Canvas({ net, onChange, readOnly, selected, setSelected, centerOnSelect, activeTypeId }) {
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [live, setLive] = useState(null); // in-progress connection
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  const tween = useRef(null);
  const { byId, typeById, neighbors, children } = useGraphIndex(net);
  const hidden = useMemo(() => hiddenByCollapse(net, children), [net, children]);

  const typeOf = (n) => typeById[n.typeId] || net.nodeTypes[0] || DEFAULT_TYPES[1];

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
    const r = el.getBoundingClientRect();
    const k = clamp(view.k, 0.75, 1.3);
    glideTo({ k, x: r.width / 2 - n.x * k, y: r.height / 2 - n.y * k });
  }, [byId, view.k, glideTo]);

  const fit = useCallback(() => {
    const el = svgRef.current;
    if (!el || !net.nodes.length) return;
    const r = el.getBoundingClientRect();
    const xs = net.nodes.map((n) => n.x), ys = net.nodes.map((n) => n.y);
    const pad = 120;
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys) + pad * 2);
    const k = clamp(Math.min(r.width / w, r.height / h), 0.2, 1.6);
    glideTo({ k, x: r.width / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * k, y: r.height / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2) * k });
  }, [net.nodes, glideTo]);

  useEffect(() => { const t = setTimeout(fit, 60); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [net.id]);
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

  const nodeAt = (wx, wy) =>
    net.nodes.filter((n) => !hidden.has(n.id)).find((n) => Math.hypot(n.x - wx, n.y - wy) <= typeOf(n).size + 6);

  const onPointerDown = (ev) => {
    if (ev.button !== 0) return;
    drag.current = { mode: "pan", sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y, moved: false };
    svgRef.current.setPointerCapture(ev.pointerId);
  };

  const startNodeDrag = (ev, n) => {
    ev.stopPropagation();
    setSelected({ kind: "node", id: n.id });
    if (readOnly) return;
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
    if (d.mode === "pan") {
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
      setLive(null);
      if (target && target.id !== d.from && !net.edges.some((e) => e.source === d.from && e.target === target.id)) {
        onChange({ ...net, edges: [...net.edges, { id: uid("e"), source: d.from, target: target.id, label: "", directed: true }] });
      }
      return;
    }
    if (d.mode === "pan" && !d.moved) setSelected(null);
  };

  const onDoubleClick = (ev) => {
    if (readOnly) return;
    const w = toWorld(ev.clientX, ev.clientY);
    if (nodeAt(w.x, w.y)) return;
    const id = uid();
    onChange({
      ...net,
      nodes: [...net.nodes, { id, label: "New node", typeId: activeTypeId || net.nodeTypes[0].id, notes: "", x: Math.round(w.x), y: Math.round(w.y), collapsed: false }],
    });
    setSelected({ kind: "node", id });
  };

  const focus = selected?.kind === "node" ? selected.id : null;
  const lit = focus ? new Set([focus, ...(neighbors[focus] || [])]) : null;
  const dim = (id) => (lit && !lit.has(id) ? 0.16 : 1);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full touch-none"
        style={{ cursor: "grab" }}
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
          {net.edges.map((e) => {
            const a = byId[e.source], b = byId[e.target];
            if (!a || !b || hidden.has(a.id) || hidden.has(b.id)) return null;
            const on = lit ? lit.has(a.id) && lit.has(b.id) : false;
            const sel = selected?.kind === "edge" && selected.id === e.id;
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const ra = typeOf(a).size + 4, rb = typeOf(b).size + 10;
            const x1 = a.x + Math.cos(ang) * ra, y1 = a.y + Math.sin(ang) * ra;
            const x2 = b.x - Math.cos(ang) * rb, y2 = b.y - Math.sin(ang) * rb;
            const bright = on || sel;
            return (
              <g key={e.id} style={{ opacity: lit ? (on ? 1 : 0.1) : 0.85, transition: "opacity 320ms ease" }}>
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
            <line x1={byId[live.from].x} y1={byId[live.from].y} x2={live.x} y2={live.y}
              stroke="#00f0ff" strokeWidth="1.6" strokeDasharray="5 5" opacity="0.8" />
          )}

          {net.nodes.map((n) => {
            if (hidden.has(n.id)) return null;
            const t = typeOf(n);
            const isSel = focus === n.id;
            const r = t.size * (isSel ? 1.16 : 1);
            const kidCount = (children[n.id] || []).filter((c) => byId[c]).length;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                style={{ opacity: dim(n.id), transition: "opacity 340ms ease", cursor: "pointer" }}
                onPointerDown={(ev) => startNodeDrag(ev, n)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}>
                <circle r={r} fill="rgba(6,12,18,0.82)" stroke={t.color} strokeWidth={isSel ? 2.6 : 2}
                  style={{
                    filter: `drop-shadow(0 0 ${isSel ? 14 : 7}px ${t.color})`,
                    transition: "r 300ms cubic-bezier(.2,.8,.2,1), stroke-width 300ms ease, filter 300ms ease",
                    animation: isSel ? "np 1.7s ease-in-out infinite" : "none",
                  }} />
                <text y={r + 15} textAnchor="middle"
                  style={{ fontFamily: MONO, fontSize: isSel ? 11.5 : 10, fill: isSel ? "#eafeff" : "#a7ccd6", pointerEvents: "none", textShadow: isSel ? `0 0 8px ${t.color}` : "none", transition: "font-size 280ms ease" }}>
                  {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                </text>
                {n.notes && <circle cx={r * 0.72} cy={-r * 0.72} r="3" fill={t.color} opacity="0.9" />}
                {kidCount > 0 && (
                  <g transform={`translate(0,${r + 22})`} onPointerDown={(ev) => { ev.stopPropagation(); onChange({ ...net, nodes: net.nodes.map((m) => (m.id === n.id ? { ...m, collapsed: !m.collapsed } : m)) }); }}>
                    <circle r="7.5" fill="rgba(6,12,18,.95)" stroke={t.color} strokeWidth="1.2" opacity="0.85" />
                    <text textAnchor="middle" y="3.2" style={{ fontFamily: MONO, fontSize: 9, fill: t.color, pointerEvents: "none" }}>
                      {n.collapsed ? kidCount : "–"}
                    </text>
                  </g>
                )}
                {!readOnly && (hover === n.id || isSel) && (
                  <circle cx={r + 9} cy={0} r="5.5" fill="#050a0e" stroke="#00f0ff" strokeWidth="1.4"
                    style={{ cursor: "crosshair", filter: "drop-shadow(0 0 5px #00f0ff)" }}
                    onPointerDown={(ev) => startConnect(ev, n)} />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <CanvasBtn onClick={fit}>fit</CanvasBtn>
        <CanvasBtn onClick={() => glideTo({ ...view, k: clamp(view.k * 1.25, 0.2, 3) })}>+</CanvasBtn>
        <CanvasBtn onClick={() => glideTo({ ...view, k: clamp(view.k / 1.25, 0.2, 3) })}>–</CanvasBtn>
      </div>
    </div>
  );
}

const CanvasBtn = ({ children, onClick }) => (
  <button onClick={onClick}
    className="w-8 h-8 rounded border text-xs"
    style={{ fontFamily: MONO, background: "rgba(8,14,20,.8)", borderColor: "rgba(0,240,255,.25)", color: "#7fd4e2" }}>
    {children}
  </button>
);
