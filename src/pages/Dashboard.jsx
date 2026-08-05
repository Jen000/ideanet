import { useState, useEffect } from "react";
import { api, summarize } from "../api";
import { DEFAULT_TYPES, uid, now } from "../constants";
import { Shell, Btn, Tag, panel } from "../ui";
import MiniPreview from "../MiniPreview";

/* =============================================================== DASHBOARD */
export default function Dashboard({ user, onOpen, onOpenPublic, onHome, onSignOut }) {
  const [tab, setTab] = useState("created");
  const [nets, setNets] = useState([]);
  const [stars, setStars] = useState([]);
  const [starIds, setStarIds] = useState([]);
  const [shared, setShared] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = () => api.myNetworks().then(setNets);
  useEffect(() => {
    Promise.all([
      api.myNetworks().then(setNets),
      api.starred().then(setStars),
      api.starredIds().then(setStarIds),
      api.sharedWithMe().then(setShared),
    ]).finally(() => setLoaded(true));
  }, []);

  const toggleStar = async (id) => {
    const r = await api.toggleStar(id);
    setStarIds((s) => (r.starred ? [...s, id] : s.filter((x) => x !== id)));
    api.starred().then(setStars); // keep the Starred tab in sync
  };
  // A bookmarked network you own opens in the editor; anyone else's opens read-only.
  const openStar = (id) => (nets.some((n) => n.id === id) ? onOpen(id) : onOpenPublic(id));

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
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-lg mb-1" style={{ color: "#eafeff" }}>{user.name}</h1>
            <p className="text-[11px]" style={{ color: "#63899a" }}>{user.email}</p>
          </div>
          {tab === "created" && <Btn tone="primary" onClick={create}>+ new network</Btn>}
        </div>

        {/* tabs */}
        <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid rgba(0,240,255,.1)" }}>
          <TabBtn on={tab === "created"} onClick={() => setTab("created")}>Created{loaded ? ` · ${nets.length}` : ""}</TabBtn>
          <TabBtn on={tab === "shared"} onClick={() => setTab("shared")}>Shared with me{loaded ? ` · ${shared.length}` : ""}</TabBtn>
          <TabBtn on={tab === "starred"} onClick={() => setTab("starred")}>Starred{loaded ? ` · ${stars.length}` : ""}</TabBtn>
        </div>

        {tab === "shared" && (
          shared.length === 0 ? (
            <Empty title="Nothing shared with you yet." body="When someone shares a private network with you, it shows up here — as a viewer you can read it, as an editor you can work on it alongside them." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shared.map((s) => (
                <button key={s.id} onClick={() => onOpen(s.id)} className="text-left rounded overflow-hidden transition-transform hover:-translate-y-0.5" style={panel}>
                  <div style={{ borderBottom: "1px solid rgba(0,240,255,.1)", background: "rgba(0,0,0,.35)" }}>
                    <MiniPreview preview={s.preview} />
                  </div>
                  <div className="p-4">
                    <div className="text-xs mb-1.5" style={{ color: "#dff6fb" }}>{s.title}</div>
                    <div className="flex items-center justify-between text-[10px]" style={{ color: "#4f7280" }}>
                      <span>by {s.author}</span>
                      <span style={{ color: s.role === "editor" ? "#39ff88" : "#7fd4e2" }}>{s.role === "editor" ? "can edit" : "view only"} · {s.nodeCount} nodes</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        )}

        {tab === "created" && (
          nets.length === 0 ? (
            <Empty title="Start with one idea." body="A new network opens with a single node. Double-click the canvas to add more, or drag a node's ⊕ handle to empty space to grow a connected branch.">
              <Btn tone="primary" onClick={create}>+ new network</Btn>
            </Empty>
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
                    <div className="flex gap-2 items-center">
                      <Btn onClick={() => onOpen(n.id)}>open</Btn>
                      <Btn tone="danger" onClick={() => remove(n.id)}>delete</Btn>
                      <button onClick={() => toggleStar(n.id)} className="ml-auto text-sm leading-none"
                        title={starIds.includes(n.id) ? "Remove from Starred" : "Save to Starred"}
                        style={{ color: starIds.includes(n.id) ? "#ffd166" : "#4f7280" }}>
                        {starIds.includes(n.id) ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "starred" && (
          stars.length === 0 ? (
            <Empty title="Nothing saved yet." body="Open any network and tap ☆ save to keep it here for later. Starred is your private reading list — separate from the ♥ likes you leave in the gallery." />
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stars.map((s) => (
              <button key={s.id} onClick={() => openStar(s.id)} className="text-left rounded overflow-hidden transition-transform hover:-translate-y-0.5" style={panel}>
                <div style={{ borderBottom: "1px solid rgba(0,240,255,.1)", background: "rgba(0,0,0,.35)" }}>
                  <MiniPreview preview={s.preview} />
                </div>
                <div className="p-4">
                  <div className="text-xs mb-1.5" style={{ color: "#dff6fb" }}>{s.title}</div>
                  {s.description && <div className="text-[10px] leading-relaxed mb-3" style={{ color: "#6f94a1", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.description}</div>}
                  <div className="flex flex-wrap gap-1 mb-3">{(s.tags || []).slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}</div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color: "#4f7280" }}>
                    <span>{s.author}</span>
                    <span>♥ {s.likes} · ◉ {s.views} · {s.nodeCount} nodes</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          )
        )}
      </div>
    </Shell>
  );
}

const TabBtn = ({ on, onClick, children }) => (
  <button onClick={onClick} className="px-3 py-2 text-xs -mb-px"
    style={{ color: on ? "#eafeff" : "#5f8492", borderBottom: on ? "2px solid #00f0ff" : "2px solid transparent" }}>
    {children}
  </button>
);

const Empty = ({ title, body, children }) => (
  <div className="p-10 rounded text-center" style={panel}>
    <div className="text-xs mb-2" style={{ color: "#9ef0ff" }}>{title}</div>
    <p className="text-[11px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "#6f94a1" }}>{body}</p>
    {children}
  </div>
);
