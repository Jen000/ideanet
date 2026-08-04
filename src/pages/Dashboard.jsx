import { useState, useEffect } from "react";
import { api, summarize } from "../api";
import { DEFAULT_TYPES, uid, now } from "../constants";
import { Shell, Btn, panel } from "../ui";
import MiniPreview from "../MiniPreview";

/* =============================================================== DASHBOARD */
export default function Dashboard({ user, onOpen, onHome, onSignOut }) {
  const [nets, setNets] = useState([]);
  const refresh = () => api.myNetworks().then(setNets);
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    const net = {
      id: uid("net"), title: "Untitled network", description: "", tags: [],
      ownerId: user.id, ownerName: user.name, visibility: "private",
      nodeTypes: DEFAULT_TYPES.map((t) => ({ ...t })),
      nodes: [{ id: uid(), label: "Start here", typeId: "t_issue", notes: "", x: 520, y: 340, collapsed: false }],
      edges: [], likes: 0, views: 0, createdAt: now(), updatedAt: now(),
    };
    await api.saveNetwork(net);
    onOpen(net.id);
  };

  const remove = async (id) => { await api.deleteNetwork(id); refresh(); };

  return (
    <Shell>
      <header className="flex items-center justify-between px-5 sm:px-8 py-4" style={{ borderBottom: "1px solid rgba(0,240,255,.1)" }}>
        <button onClick={onHome} className="text-sm tracking-[0.3em]" style={{ color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.45)" }}>◇ IDEANET</button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] hidden sm:inline" style={{ color: "#5c7f8c" }}>{user.name}</span>
          <Btn onClick={onSignOut}>sign out</Btn>
        </div>
      </header>

      <div className="px-5 sm:px-8 py-10 max-w-6xl">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg mb-1" style={{ color: "#eafeff" }}>Your networks</h1>
            <p className="text-[11px]" style={{ color: "#63899a" }}>{nets.length ? `${nets.length} saved` : "Nothing saved yet."}</p>
          </div>
          <Btn tone="primary" onClick={create}>+ new network</Btn>
        </div>

        {nets.length === 0 ? (
          <div className="p-10 rounded text-center" style={panel}>
            <div className="text-xs mb-2" style={{ color: "#9ef0ff" }}>Start with one idea.</div>
            <p className="text-[11px] mb-5" style={{ color: "#6f94a1" }}>A new network opens with a single node. Double-click the canvas to add more, or drag a node's ⊕ handle to empty space to grow a connected branch.</p>
            <Btn tone="primary" onClick={create}>+ new network</Btn>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nets.map((n) => (
              <div key={n.id} className="rounded overflow-hidden" style={panel}>
                <button onClick={() => onOpen(n.id)} className="block w-full text-left" style={{ borderBottom: "1px solid rgba(0,240,255,.1)", background: "rgba(0,0,0,.35)" }}>
                  <MiniPreview preview={summarize(n).preview} />
                </button>
                <div className="p-4">
                  <button onClick={() => onOpen(n.id)} className="text-xs mb-1.5 block text-left" style={{ color: "#dff6fb" }}>{n.title}</button>
                  <div className="flex items-center gap-2 mb-3 text-[10px]" style={{ color: "#4f7280" }}>
                    <span style={{ color: n.visibility === "public" ? "#39ff88" : "#5c7f8c" }}>{n.visibility}</span>
                    <span>· {n.nodes.length} nodes</span>
                  </div>
                  <div className="flex gap-2">
                    <Btn onClick={() => onOpen(n.id)}>open</Btn>
                    <Btn tone="danger" onClick={() => remove(n.id)}>delete</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
