import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { DEFAULT_TYPES, SWATCHES, SHAPES, uid } from "../constants";
import { radialLayout } from "../graph";
import { Shell, Btn, Tag, panel, inputCls, inputStyle, Spinner } from "../ui";
import Canvas from "../Canvas";

/* ================================================================== EDITOR */
export default function Editor({ netId, user, onExit, readOnly, publicNet, onLike, liked, onStar, starred }) {
  const [net, setNet] = useState(publicNet || null);
  const [role, setRole] = useState(publicNet ? "viewer" : null);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState("saved");
  const [activeTypeId, setActiveTypeId] = useState("t_solution");
  const [centerOnSelect, setCenterOnSelect] = useState(true);
  const [showTypes, setShowTypes] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [collabs, setCollabs] = useState([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [shareErr, setShareErr] = useState("");
  const first = useRef(true);
  const topicRef = useRef(null);
  const focusNew = useRef(false); // focus the topic field when a node is freshly created
  const baseUpdatedAt = useRef(publicNet ? publicNet.updatedAt : null);

  const ro = readOnly || role === "viewer"; // effective read-only (public view or a view-only collaborator)

  const load = () =>
    api.openNetwork(netId).then((r) => {
      if (!r) { setNotFound(true); return; }
      first.current = true;
      baseUpdatedAt.current = r.net.updatedAt;
      setNet(r.net); setRole(r.role);
    }).catch(() => setNotFound(true));

  useEffect(() => {
    if (publicNet) return;
    load();
    /* eslint-disable-next-line */
  }, [netId, publicNet]);

  useEffect(() => {
    if (ro || !net) return;
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(() => {
      api.saveNetwork({ ...net, updatedAt: baseUpdatedAt.current ?? net.updatedAt })
        .then((s) => { baseUpdatedAt.current = s.updatedAt; setSaved("saved"); })
        .catch((e) => setSaved(e?.status === 409 || /changed by someone else/i.test(e?.message || "") ? "conflict" : "error"));
    }, 550);
    return () => clearTimeout(t);
  }, [net, ro]);

  // Owner-only: who this network is shared with.
  useEffect(() => {
    if (role === "owner" && net) api.collaborators(net.id).then(setCollabs).catch(() => {});
    /* eslint-disable-next-line */
  }, [role, net?.id]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape") document.activeElement.blur(); return; }
      if (e.key === "Escape") setSelected(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !ro) {
        e.preventDefault();
        setNet((n) => selected.kind === "node"
          ? { ...n, nodes: n.nodes.filter((x) => x.id !== selected.id), edges: n.edges.filter((x) => x.source !== selected.id && x.target !== selected.id) }
          : { ...n, edges: n.edges.filter((x) => x.id !== selected.id) });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, ro]);

  // Selecting a node/edge reopens the details panel (it can be dismissed).
  useEffect(() => { if (selected) setShowInspector(true); }, [selected]);

  // When a node was just created, drop the cursor into its topic field and
  // select the placeholder so the user can type straight away.
  useEffect(() => {
    if (selected?.kind === "node" && focusNew.current) {
      focusNew.current = false;
      setShowInspector(true);
      requestAnimationFrame(() => { topicRef.current?.focus(); topicRef.current?.select(); });
    }
    /* eslint-disable-next-line */
  }, [selected?.id]);

  const reload = async () => { setNotFound(false); await load(); setSaved("saved"); setSelected(null); };
  const doShare = async () => {
    setShareErr("");
    if (!shareEmail.trim()) return;
    // On a public network, viewer access is meaningless — only editors are added.
    const role = net.visibility === "public" ? "editor" : shareRole;
    try {
      const c = await api.shareNetwork(net.id, shareEmail, role);
      setCollabs((cs) => [...cs.filter((x) => x.userId !== c.userId), c]);
      setShareEmail("");
    } catch (e) { setShareErr(e.message); }
  };
  const doUnshare = async (userId) => {
    await api.unshareNetwork(net.id, userId);
    setCollabs((cs) => cs.filter((x) => x.userId !== userId));
  };

  if (notFound) return <Shell><div className="min-h-screen flex items-center justify-center text-xs text-center px-6" style={{ color: "#5f8492" }}>This network doesn't exist, or it isn't shared with you.<br /><button onClick={onExit} className="mt-3" style={{ color: "#00f0ff" }}>← back</button></div></Shell>;
  if (!net) return <Shell><div className="min-h-screen flex flex-col items-center justify-center gap-3"><Spinner /><div className="text-[10px] tracking-widest" style={{ color: "#5f8492" }}>LOADING</div></div></Shell>;

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
    focusNew.current = true;
    setNet((n) => ({ ...n, nodes: [...n.nodes, { id, label: "New node", typeId: activeTypeId, notes: "", x: 480 + Math.random() * 90, y: 320 + Math.random() * 90, collapsed: false }] }));
    setSelected({ kind: "node", id });
  };

  return (
    <Shell>
      <div className="h-screen flex flex-col">
        {/* top bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 z-30 flex-wrap" style={{ borderBottom: "1px solid rgba(0,240,255,.12)", background: "rgba(3,7,10,.9)" }}>
          <Btn onClick={onExit}>←</Btn>
          {ro ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs truncate" style={{ color: "#dff6fb" }}>{net.title}</span>
              <span className="text-[10px]" style={{ color: "#4f7280" }}>by {net.ownerName}</span>
              {!readOnly && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#7fd4e2", border: "1px solid rgba(0,240,255,.25)" }}>view only</span>}
            </div>
          ) : (
            <input value={net.title} onChange={(e) => setNet({ ...net, title: e.target.value })}
              className="px-2 py-1 rounded text-xs flex-1 min-w-[140px] max-w-xs" style={{ ...inputStyle, border: "1px solid transparent" }} />
          )}
          <div className="flex-1" />
          {readOnly ? (
            <div className="flex items-center gap-2">
              {onStar && <Btn tone={starred ? "primary" : "ghost"} onClick={onStar}>{starred ? "★ saved" : "☆ save"}</Btn>}
              <Btn tone={liked ? "primary" : "ghost"} onClick={onLike}>♥ {net.likes || 0}</Btn>
            </div>
          ) : ro ? null : (
            <>
              {saved === "conflict" ? (
                <button onClick={reload} className="text-[10px]" style={{ color: "#ff90b0" }} title="Someone else saved changes. Reload to get the latest, then reapply your edit.">edited elsewhere · reload</button>
              ) : (
                <span className="text-[10px] hidden sm:inline" style={{ color: saved === "saved" ? "#39ff88" : saved === "error" ? "#ff90b0" : "#ffd166" }}>{saved === "error" ? "save failed" : saved}</span>
              )}
              {role === "editor" && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#39ff88", border: "1px solid rgba(57,255,136,.3)" }}>shared · editor</span>}
              <Btn onClick={() => setNet(radialLayout(net))}>auto-arrange</Btn>
              <Btn tone={centerOnSelect ? "primary" : "ghost"} onClick={() => setCenterOnSelect((v) => !v)}>centre on select</Btn>
              <Btn tone="primary" onClick={addNode}>+ node</Btn>
            </>
          )}
        </div>

        <div className="relative flex-1">
          <Canvas net={net} onChange={setNet} readOnly={ro} selected={selected} setSelected={setSelected}
            centerOnSelect={centerOnSelect} activeTypeId={activeTypeId} onNodeCreate={() => { focusNew.current = true; }} />

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
                {!ro && <button onClick={() => setShowTypes((v) => !v)} className="text-[10px]" style={{ color: "#00f0ff" }}>{showTypes ? "done" : "edit"}</button>}
              </div>
              <div className="flex flex-col gap-1">
                {net.nodeTypes.map((t) => (
                  <div key={t.id}>
                    <button onClick={() => setActiveTypeId(t.id)} className="flex items-center gap-2 w-full px-1 py-0.5 rounded text-[10px]"
                      style={{ background: activeTypeId === t.id && !ro ? "rgba(0,240,255,.08)" : "transparent" }}>
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
                        <div className="flex gap-1.5">
                          {SHAPES.map((s) => (
                            <button key={s} title={s} onClick={() => patchType(t.id, { shape: s })}
                              className="w-6 h-6 rounded flex items-center justify-center"
                              style={{ background: (t.shape || "circle") === s ? "rgba(0,240,255,.1)" : "transparent", outline: (t.shape || "circle") === s ? "1px solid rgba(0,240,255,.5)" : "1px solid rgba(0,240,255,.12)" }}>
                              <ShapeIcon shape={s} color={t.color} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {showTypes && (
                <button onClick={() => { const id = uid("t"); setNet({ ...net, nodeTypes: [...net.nodeTypes, { id, name: "new type", color: SWATCHES[net.nodeTypes.length % SWATCHES.length], size: 22, shape: "circle" }] }); }}
                  className="mt-2 text-[10px]" style={{ color: "#00f0ff" }}>+ add type</button>
              )}
            </div>

            {selected && <Btn onClick={() => setSelected(null)}>clear selection</Btn>}
          </div>

          {/* right: inspector (dismissible — a panel on desktop, a pop-over on mobile) */}
          {!showInspector && (selNode || selEdge || !ro) && (
            <button onClick={() => setShowInspector(true)} className="absolute top-3 right-3 z-20 rounded px-2.5 py-1.5 text-[10px]" style={{ ...panel, color: "#7fd4e2" }}>details ▸</button>
          )}
          {showInspector && (selNode || selEdge || !ro) && (
            <div className="absolute top-3 right-3 w-64 max-w-[78vw] z-20 rounded p-3 pr-6 max-h-[calc(100%-1.5rem)] overflow-y-auto" style={panel}>
              <button onClick={() => setShowInspector(false)} title="Close" className="absolute top-1 right-1.5 text-base leading-none px-1" style={{ color: "#6f94a1" }}>×</button>
              {selNode ? (
                <>
                  <div className="text-[10px] mb-2" style={{ color: "#5f8492" }}>NODE</div>
                  <label className="text-[9px] block mb-1" style={{ color: "#5f8492" }}>TOPIC · shown on the node</label>
                  <input ref={topicRef} value={selNode.label} onChange={(e) => patchNode({ label: e.target.value })} disabled={ro}
                    placeholder="short topic" className={`${inputCls} mb-2`} style={inputStyle} />
                  <select value={selNode.typeId} onChange={(e) => patchNode({ typeId: e.target.value })} disabled={ro}
                    className={`${inputCls} mb-2`} style={inputStyle}>
                    {net.nodeTypes.map((t) => <option key={t.id} value={t.id} style={{ background: "#06101a" }}>{t.name}</option>)}
                  </select>
                  <label className="text-[9px] block mb-1" style={{ color: "#5f8492" }}>STATEMENT · the full detail</label>
                  <textarea value={selNode.notes} onChange={(e) => patchNode({ notes: e.target.value })} disabled={ro}
                    placeholder="e.g. the full problem statement" rows={5} className={`${inputCls} mb-2 resize-none`} style={inputStyle} />
                  {!ro && (
                    <Btn tone="danger" onClick={() => {
                      setNet((n) => ({ ...n, nodes: n.nodes.filter((x) => x.id !== selNode.id), edges: n.edges.filter((x) => x.source !== selNode.id && x.target !== selNode.id) }));
                      setSelected(null);
                    }}>delete node</Btn>
                  )}
                </>
              ) : selEdge ? (
                <>
                  <div className="text-[10px] mb-2" style={{ color: "#5f8492" }}>CONNECTION</div>
                  <input value={selEdge.label} onChange={(e) => patchEdge({ label: e.target.value })} disabled={ro}
                    placeholder="leads to, requires, contradicts…" className={`${inputCls} mb-2`} style={inputStyle} />
                  {!ro && (
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

                  {role === "owner" && (
                    <>
                      <div className="text-[10px] mb-1.5" style={{ color: "#5f8492" }}>VISIBILITY</div>
                      <div className="flex gap-2 mb-2">
                        <Btn tone={net.visibility === "private" ? "primary" : "ghost"} onClick={async () => { setNet({ ...net, visibility: "private" }); await api.unpublish(net.id); }}>private</Btn>
                        <Btn tone={net.visibility === "public" ? "primary" : "ghost"} onClick={() => setNet({ ...net, visibility: "public" })}>public</Btn>
                      </div>
                      <p className="text-[9px] leading-relaxed mb-3" style={{ color: "#456773" }}>
                        {net.visibility === "public"
                          ? "Listed in the public gallery. Anyone can open and read it."
                          : "Private — only you and people you share it with can see it."}
                      </p>

                      <div className="text-[10px] mb-1.5 pt-3" style={{ color: "#5f8492", borderTop: "1px solid rgba(0,240,255,.1)" }}>
                        {net.visibility === "public" ? "ADD EDITORS" : "SHARE"}
                      </div>
                      <div className="flex gap-1.5 mb-1">
                        <input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doShare()}
                          placeholder="email" type="email" className={inputCls} style={{ ...inputStyle, flex: 1 }} />
                        {net.visibility === "public" ? (
                          <span className="flex items-center px-2 text-[10px]" style={{ color: "#39ff88" }}>editor</span>
                        ) : (
                          <select value={shareRole} onChange={(e) => setShareRole(e.target.value)} className="rounded text-[10px] px-1" style={inputStyle}>
                            <option value="viewer" style={{ background: "#06101a" }}>viewer</option>
                            <option value="editor" style={{ background: "#06101a" }}>editor</option>
                          </select>
                        )}
                        <Btn tone="primary" onClick={doShare}>add</Btn>
                      </div>
                      <p className="text-[9px] leading-relaxed mb-1.5" style={{ color: "#456773" }}>
                        {net.visibility === "public"
                          ? "It's already visible to everyone — add people here to let them edit it."
                          : "Add people by email as a viewer (read-only) or editor."}
                      </p>
                      {shareErr && <div className="text-[9px] mb-2" style={{ color: "#ff90b0" }}>{shareErr}</div>}
                      {collabs.length > 0 && (
                        <div className="flex flex-col gap-1 mb-2">
                          {collabs.map((c) => (
                            <div key={c.userId} className="flex items-center gap-1.5 text-[10px]">
                              <span className="truncate flex-1" style={{ color: "#b6dbe4" }} title={c.email}>{c.name || c.email}</span>
                              <span style={{ color: c.role === "editor" ? "#39ff88" : "#7fd4e2" }}>{c.role}</span>
                              <button onClick={() => doUnshare(c.userId)} title="Remove" style={{ color: "#ff6b8a" }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <p className="text-[9px] leading-relaxed mt-3 pt-3" style={{ color: "#3f5f6c", borderTop: "1px solid rgba(0,240,255,.1)" }}>
                    Double-click empty canvas to add a node. Drag the ⊕ handle on a node to another to link them — or to empty space to drop a new connected node. Select a node and press Delete to remove it.
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

/* Little type-picker glyph so the shape choice is visible, not just named. */
function ShapeIcon({ shape, color }) {
  const s = { fill: "none", stroke: color, strokeWidth: 1.4 };
  return (
    <svg width="14" height="14" viewBox="-8 -8 16 16">
      {shape === "square" ? (
        <rect x="-5.5" y="-5.5" width="11" height="11" rx="1.5" {...s} />
      ) : shape === "diamond" ? (
        <polygon points="0,-6.5 6.5,0 0,6.5 -6.5,0" {...s} />
      ) : shape === "hexagon" ? (
        <polygon points="0,-6.5 5.6,-3.25 5.6,3.25 0,6.5 -5.6,3.25 -5.6,-3.25" {...s} />
      ) : (
        <circle r="6" {...s} />
      )}
    </svg>
  );
}
