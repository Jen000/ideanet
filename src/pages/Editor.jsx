import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { DEFAULT_TYPES, SWATCHES, uid } from "../constants";
import { radialLayout } from "../graph";
import { Shell, Btn, Tag, panel, inputCls, inputStyle } from "../ui";
import Canvas from "../Canvas";

/* ================================================================== EDITOR */
export default function Editor({ netId, user, onExit, readOnly, publicNet, onLike, liked }) {
  const [net, setNet] = useState(publicNet || null);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState("saved");
  const [activeTypeId, setActiveTypeId] = useState("t_solution");
  const [centerOnSelect, setCenterOnSelect] = useState(true);
  const [showTypes, setShowTypes] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (publicNet) return;
    api.myNetworks().then((all) => setNet(all.find((n) => n.id === netId) || null));
  }, [netId, publicNet]);

  useEffect(() => {
    if (readOnly || !net) return;
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(() => api.saveNetwork(net).then(() => setSaved("saved")), 550);
    return () => clearTimeout(t);
  }, [net, readOnly]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape") document.activeElement.blur(); return; }
      if (e.key === "Escape") setSelected(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !readOnly) {
        e.preventDefault();
        setNet((n) => selected.kind === "node"
          ? { ...n, nodes: n.nodes.filter((x) => x.id !== selected.id), edges: n.edges.filter((x) => x.source !== selected.id && x.target !== selected.id) }
          : { ...n, edges: n.edges.filter((x) => x.id !== selected.id) });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, readOnly]);

  if (!net) return <Shell><div className="min-h-screen flex items-center justify-center text-xs" style={{ color: "#5f8492" }}>Loading network…</div></Shell>;

  const results = q.trim()
    ? net.nodes.filter((n) => `${n.label} ${n.notes}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const selNode = selected?.kind === "node" ? net.nodes.find((n) => n.id === selected.id) : null;
  const selEdge = selected?.kind === "edge" ? net.edges.find((e) => e.id === selected.id) : null;
  const patchNode = (p) => setNet((n) => ({ ...n, nodes: n.nodes.map((x) => (x.id === selNode.id ? { ...x, ...p } : x)) }));
  const patchEdge = (p) => setNet((n) => ({ ...n, edges: n.edges.map((x) => (x.id === selEdge.id ? { ...x, ...p } : x)) }));
  const patchType = (id, p) => setNet((n) => ({ ...n, nodeTypes: n.nodeTypes.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  const addNode = () => {
    const id = uid();
    setNet((n) => ({ ...n, nodes: [...n.nodes, { id, label: "New node", typeId: activeTypeId, notes: "", x: 480 + Math.random() * 90, y: 320 + Math.random() * 90, collapsed: false }] }));
    setSelected({ kind: "node", id });
  };

  return (
    <Shell>
      <div className="h-screen flex flex-col">
        {/* top bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 z-30 flex-wrap" style={{ borderBottom: "1px solid rgba(0,240,255,.12)", background: "rgba(3,7,10,.9)" }}>
          <Btn onClick={onExit}>←</Btn>
          {readOnly ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs truncate" style={{ color: "#dff6fb" }}>{net.title}</span>
              <span className="text-[10px]" style={{ color: "#4f7280" }}>by {net.ownerName}</span>
            </div>
          ) : (
            <input value={net.title} onChange={(e) => setNet({ ...net, title: e.target.value })}
              className="px-2 py-1 rounded text-xs flex-1 min-w-[140px] max-w-xs" style={{ ...inputStyle, border: "1px solid transparent" }} />
          )}
          <div className="flex-1" />
          {readOnly ? (
            <Btn tone={liked ? "primary" : "ghost"} onClick={onLike}>♥ {net.likes || 0}</Btn>
          ) : (
            <>
              <span className="text-[10px] hidden sm:inline" style={{ color: saved === "saved" ? "#39ff88" : "#ffd166" }}>{saved}</span>
              <Btn onClick={() => setNet(radialLayout(net))}>auto-arrange</Btn>
              <Btn tone={centerOnSelect ? "primary" : "ghost"} onClick={() => setCenterOnSelect((v) => !v)}>centre on select</Btn>
              <Btn tone="primary" onClick={addNode}>+ node</Btn>
            </>
          )}
        </div>

        <div className="relative flex-1">
          <Canvas net={net} onChange={setNet} readOnly={readOnly} selected={selected} setSelected={setSelected}
            centerOnSelect={centerOnSelect} activeTypeId={activeTypeId} />

          {/* left: search + legend */}
          <div className="absolute top-3 left-3 w-56 z-20 flex flex-col gap-2">
            <div className="rounded p-2" style={panel}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search nodes"
                className={inputCls} style={inputStyle} />
              {results.length > 0 && (
                <div className="mt-1.5 flex flex-col">
                  {results.map((r) => {
                    const t = net.nodeTypes.find((x) => x.id === r.typeId) || DEFAULT_TYPES[1];
                    return (
                      <button key={r.id} onClick={() => { setSelected({ kind: "node", id: r.id }); setQ(""); }}
                        className="flex items-center gap-2 px-1.5 py-1 rounded text-[10px] text-left hover:bg-white/5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
                        <span className="truncate" style={{ color: "#b6dbe4" }}>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded p-2.5" style={panel}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px]" style={{ color: "#5f8492" }}>NODE TYPES</span>
                {!readOnly && <button onClick={() => setShowTypes((v) => !v)} className="text-[10px]" style={{ color: "#00f0ff" }}>{showTypes ? "done" : "edit"}</button>}
              </div>
              <div className="flex flex-col gap-1">
                {net.nodeTypes.map((t) => (
                  <div key={t.id}>
                    <button onClick={() => setActiveTypeId(t.id)} className="flex items-center gap-2 w-full px-1 py-0.5 rounded text-[10px]"
                      style={{ background: activeTypeId === t.id && !readOnly ? "rgba(0,240,255,.08)" : "transparent" }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color, boxShadow: `0 0 7px ${t.color}` }} />
                      <span className="truncate" style={{ color: "#a7ccd6" }}>{t.name}</span>
                    </button>
                    {showTypes && (
                      <div className="pl-4 pb-2 pt-1 flex flex-col gap-1.5">
                        <input value={t.name} onChange={(e) => patchType(t.id, { name: e.target.value })} className="px-1.5 py-1 rounded text-[10px]" style={inputStyle} />
                        <div className="flex flex-wrap gap-1">
                          {SWATCHES.map((c) => (
                            <button key={c} onClick={() => patchType(t.id, { color: c })} className="w-3.5 h-3.5 rounded-full"
                              style={{ background: c, outline: t.color === c ? "1.5px solid #fff" : "none", outlineOffset: 1 }} />
                          ))}
                        </div>
                        <input type="range" min="10" max="46" value={t.size} onChange={(e) => patchType(t.id, { size: Number(e.target.value) })} className="w-full" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {showTypes && (
                <button onClick={() => { const id = uid("t"); setNet({ ...net, nodeTypes: [...net.nodeTypes, { id, name: "new type", color: SWATCHES[net.nodeTypes.length % SWATCHES.length], size: 22 }] }); }}
                  className="mt-2 text-[10px]" style={{ color: "#00f0ff" }}>+ add type</button>
              )}
            </div>

            {selected && <Btn onClick={() => setSelected(null)}>clear selection</Btn>}
          </div>

          {/* right: inspector */}
          {(selNode || selEdge || !readOnly) && (
            <div className="absolute top-3 right-3 w-64 z-20 rounded p-3 max-h-[calc(100%-1.5rem)] overflow-y-auto" style={panel}>
              {selNode ? (
                <>
                  <div className="text-[10px] mb-2" style={{ color: "#5f8492" }}>NODE</div>
                  <input value={selNode.label} onChange={(e) => patchNode({ label: e.target.value })} disabled={readOnly}
                    className={`${inputCls} mb-2`} style={inputStyle} />
                  <select value={selNode.typeId} onChange={(e) => patchNode({ typeId: e.target.value })} disabled={readOnly}
                    className={`${inputCls} mb-2`} style={inputStyle}>
                    {net.nodeTypes.map((t) => <option key={t.id} value={t.id} style={{ background: "#06101a" }}>{t.name}</option>)}
                  </select>
                  <textarea value={selNode.notes} onChange={(e) => patchNode({ notes: e.target.value })} disabled={readOnly}
                    placeholder="notes" rows={5} className={`${inputCls} mb-2 resize-none`} style={inputStyle} />
                  {!readOnly && (
                    <Btn tone="danger" onClick={() => {
                      setNet((n) => ({ ...n, nodes: n.nodes.filter((x) => x.id !== selNode.id), edges: n.edges.filter((x) => x.source !== selNode.id && x.target !== selNode.id) }));
                      setSelected(null);
                    }}>delete node</Btn>
                  )}
                </>
              ) : selEdge ? (
                <>
                  <div className="text-[10px] mb-2" style={{ color: "#5f8492" }}>CONNECTION</div>
                  <input value={selEdge.label} onChange={(e) => patchEdge({ label: e.target.value })} disabled={readOnly}
                    placeholder="leads to, requires, contradicts…" className={`${inputCls} mb-2`} style={inputStyle} />
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Btn onClick={() => patchEdge({ directed: !selEdge.directed })}>{selEdge.directed ? "directed" : "undirected"}</Btn>
                      <Btn tone="danger" onClick={() => { setNet((n) => ({ ...n, edges: n.edges.filter((x) => x.id !== selEdge.id) })); setSelected(null); }}>delete</Btn>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[10px] mb-2" style={{ color: "#5f8492" }}>NETWORK</div>
                  <textarea value={net.description} onChange={(e) => setNet({ ...net, description: e.target.value })}
                    placeholder="what this network is for" rows={3} className={`${inputCls} mb-2 resize-none`} style={inputStyle} />
                  <input defaultValue={(net.tags || []).join(", ")} onBlur={(e) => setNet({ ...net, tags: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6) })}
                    placeholder="tags, comma separated" className={`${inputCls} mb-2`} style={inputStyle} />
                  <div className="flex flex-wrap gap-1 mb-3">{(net.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}</div>
                  <div className="text-[10px] mb-1.5" style={{ color: "#5f8492" }}>VISIBILITY</div>
                  <div className="flex gap-2 mb-2">
                    <Btn tone={net.visibility === "private" ? "primary" : "ghost"} onClick={async () => { setNet({ ...net, visibility: "private" }); await api.unpublish(net.id); }}>private</Btn>
                    <Btn tone={net.visibility === "public" ? "primary" : "ghost"} onClick={() => setNet({ ...net, visibility: "public" })}>public</Btn>
                  </div>
                  <p className="text-[9px] leading-relaxed" style={{ color: "#456773" }}>
                    {net.visibility === "public"
                      ? "Listed in the public gallery. Anyone can open and read it; only you can edit."
                      : "Only you can see this network."}
                  </p>
                  <p className="text-[9px] leading-relaxed mt-3 pt-3" style={{ color: "#3f5f6c", borderTop: "1px solid rgba(0,240,255,.1)" }}>
                    Double-click empty canvas to add a node. Drag the cyan dot on a node to connect it to another. Select a node and press Delete to remove it.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
