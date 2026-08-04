import { DEFAULT_TYPES, uid, now } from "../constants";

/* ---------------------------------------------------------------- persistence
   Demo store. Uses the artifact key/value store when present, in-memory
   otherwise. Personal keys are per-person; shared keys back the public gallery.
   AWS mapping:
     accounts/session -> Cognito user pool
     mynets           -> DynamoDB  PK=USER#id  SK=NET#id
     pubindex/pub:id  -> DynamoDB GSI on visibility, sorted by score
------------------------------------------------------------------------------*/
const mem = new Map();
const k = (key, shared) => `ideanet:${shared ? "shared" : "me"}:${key}`;

const store = {
  async get(key, shared = false) {
    try {
      const raw = localStorage.getItem(k(key, shared));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return mem.has(k(key, shared)) ? mem.get(k(key, shared)) : null;
    }
  },
  async set(key, value, shared = false) {
    mem.set(k(key, shared), value);
    try {
      localStorage.setItem(k(key, shared), JSON.stringify(value));
    } catch {
      /* private browsing / quota: in-memory copy already written */
    }
  },
};

const seedNetworks = () => {
  const mk = (id, title, description, tags, author, likes, views, nodes, edges) => ({
    id, title, description, tags, ownerId: `seed_${id}`, ownerName: author,
    visibility: "public", nodeTypes: DEFAULT_TYPES, nodes, edges,
    likes, views, createdAt: now(), updatedAt: now(),
  });
  const n = (id, label, typeId, x, y, notes = "") => ({ id, label, typeId, x, y, notes, collapsed: false });
  const e = (s, t, label = "") => ({ id: uid("e"), source: s, target: t, label, directed: true });

  return [
    mk("demo_churn", "Client churn diagnostic", "A worked example of the root-cause drill-down: one issue, four candidate approaches, concrete actions underneath each.",
      ["consulting", "diagnostics", "retention"], "sable", 128, 1943,
      [
        n("a", "Churn up 14% QoQ", "t_issue", 500, 340, "Started after the March pricing change. Concentrated in accounts under 20 seats."),
        n("b", "Onboarding friction", "t_solution", 240, 190),
        n("c", "Pricing mismatch", "t_solution", 470, 110),
        n("d", "Support latency", "t_solution", 730, 190),
        n("e", "Feature gaps", "t_solution", 760, 470),
        n("f", "Rebuild setup wizard", "t_sub", 90, 90),
        n("g", "Guided first run", "t_sub", 70, 280),
        n("h", "Starter tier", "t_sub", 380, 30),
        n("i", "Usage add-ons", "t_sub", 590, 30),
        n("j", "Chat coverage", "t_sub", 900, 110),
        n("k", "Response SLA", "t_sub", 930, 280),
        n("l", "Public API", "t_sub", 930, 560),
        n("m", "Custom reports", "t_sub", 660, 620),
        n("z", "Q3 exit interviews", "t_note", 260, 560, "14 of 22 leavers named setup time unprompted."),
      ],
      [
        e("a", "b", "may cause"), e("a", "c", "may cause"), e("a", "d", "may cause"), e("a", "e", "may cause"),
        e("b", "f"), e("b", "g"), e("c", "h"), e("c", "i"), e("d", "j"), e("d", "k"), e("e", "l"), e("e", "m"),
        e("z", "a", "evidence for"),
      ]),
    mk("demo_rome", "Fall of the Western Empire", "Study map for a survey course — causes, counter-arguments, and where the historiography disagrees.",
      ["history", "study", "notes"], "kestrel", 96, 1502,
      [
        n("a", "Collapse of 476", "t_issue", 500, 330),
        n("b", "Fiscal exhaustion", "t_solution", 250, 180),
        n("c", "Frontier pressure", "t_solution", 520, 120),
        n("d", "Political fragmentation", "t_solution", 770, 200),
        n("e", "Debasement of currency", "t_sub", 110, 90),
        n("f", "Tax base shrinks", "t_sub", 100, 300),
        n("g", "Gothic settlement", "t_sub", 430, 20),
        n("h", "Rhine crossing 406", "t_sub", 640, 20),
        n("i", "Rival claimants", "t_sub", 940, 130),
        n("j", "Army loyalty local", "t_sub", 950, 320),
        n("k", "Gibbon overstates religion", "t_note", 330, 540),
        n("l", "Continuity thesis", "t_note", 640, 560, "Late antiquity as transformation, not collapse."),
      ],
      [
        e("b", "a", "contributes to"), e("c", "a", "contributes to"), e("d", "a", "contributes to"),
        e("e", "b"), e("f", "b"), e("g", "c"), e("h", "c"), e("i", "d"), e("j", "d"),
        e("k", "a", "contradicts"), e("l", "a", "contradicts"),
      ]),
    mk("demo_novel", "Second-act problem", "Untangling a stuck manuscript. Nodes are scenes and pressures; edges are what forces what.",
      ["writing", "brainstorm", "fiction"], "orrin", 61, 884,
      [
        n("a", "Middle sags", "t_issue", 480, 320),
        n("b", "Stakes go flat", "t_solution", 240, 200),
        n("c", "Antagonist offstage", "t_solution", 720, 200),
        n("d", "Give her something to lose", "t_sub", 110, 110),
        n("e", "Shorten the timeline", "t_sub", 110, 320),
        n("f", "Move the letter earlier", "t_sub", 880, 110),
        n("g", "Ch. 11 is the real hinge", "t_note", 500, 550),
      ],
      [e("b", "a"), e("c", "a"), e("d", "b"), e("e", "b"), e("f", "c"), e("g", "a", "relates to")]),
  ];
};

export const api = {
  async ensureSeed() {
    const idx = await store.get("pubindex", true);
    if (idx && Object.keys(idx).length) return;
    const nets = seedNetworks();
    const next = {};
    for (const net of nets) {
      await store.set(`pub:${net.id}`, net, true);
      next[net.id] = summarize(net);
    }
    await store.set("pubindex", next, true);
  },
  async signUp(name, email, password) {
    const accounts = (await store.get("accounts")) || {};
    const key = email.trim().toLowerCase();
    if (!key || !password) throw new Error("Enter an email and a password.");
    if (accounts[key]) throw new Error("That email already has an account. Sign in instead.");
    const user = { id: uid("u"), name: name.trim() || key.split("@")[0], email: key, password };
    accounts[key] = user;
    await store.set("accounts", accounts);
    await store.set("session", { userId: user.id, email: key });
    return publicUser(user);
  },
  async signIn(email, password) {
    const accounts = (await store.get("accounts")) || {};
    const user = accounts[email.trim().toLowerCase()];
    if (!user || user.password !== password) throw new Error("That email and password don't match an account.");
    await store.set("session", { userId: user.id, email: user.email });
    return publicUser(user);
  },
  async signOut() {
    await store.set("session", null);
  },
  async currentUser() {
    const s = await store.get("session");
    if (!s) return null;
    const accounts = (await store.get("accounts")) || {};
    const user = accounts[s.email];
    return user ? publicUser(user) : null;
  },
  async myNetworks() {
    return Object.values((await store.get("mynets")) || {}).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async saveNetwork(net) {
    const all = (await store.get("mynets")) || {};
    all[net.id] = { ...net, updatedAt: now() };
    await store.set("mynets", all);
    if (net.visibility === "public") {
      await store.set(`pub:${net.id}`, all[net.id], true);
      const idx = (await store.get("pubindex", true)) || {};
      idx[net.id] = { ...summarize(all[net.id]), likes: idx[net.id]?.likes ?? 0, views: idx[net.id]?.views ?? 0 };
      await store.set("pubindex", idx, true);
    }
    return all[net.id];
  },
  async unpublish(id) {
    const idx = (await store.get("pubindex", true)) || {};
    delete idx[id];
    await store.set("pubindex", idx, true);
  },
  async deleteNetwork(id) {
    const all = (await store.get("mynets")) || {};
    delete all[id];
    await store.set("mynets", all);
    await api.unpublish(id);
  },
  async gallery() {
    const idx = (await store.get("pubindex", true)) || {};
    return Object.values(idx).sort((a, b) => score(b) - score(a));
  },
  async openPublic(id) {
    const net = await store.get(`pub:${id}`, true);
    if (!net) return null;
    const idx = (await store.get("pubindex", true)) || {};
    if (idx[id]) {
      idx[id].views = (idx[id].views || 0) + 1;
      await store.set("pubindex", idx, true);
    }
    return { ...net, likes: idx[id]?.likes ?? 0, views: idx[id]?.views ?? 0 };
  },
  async toggleLike(id) {
    const liked = (await store.get("liked")) || [];
    const on = liked.includes(id);
    const next = on ? liked.filter((x) => x !== id) : [...liked, id];
    await store.set("liked", next);
    const idx = (await store.get("pubindex", true)) || {};
    if (idx[id]) {
      idx[id].likes = Math.max(0, (idx[id].likes || 0) + (on ? -1 : 1));
      await store.set("pubindex", idx, true);
    }
    return { liked: !on, likes: idx[id]?.likes ?? 0 };
  },
  async likedIds() {
    return (await store.get("liked")) || [];
  },
  async starred() {
    const liked = (await store.get("liked")) || [];
    const idx = (await store.get("pubindex", true)) || {};
    // Summaries for the ids still public, ranked like the gallery.
    return liked.map((id) => idx[id]).filter(Boolean).sort((a, b) => score(b) - score(a));
  },
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
export const summarize = (n) => ({
  id: n.id, title: n.title, description: n.description, tags: n.tags,
  author: n.ownerName, likes: n.likes || 0, views: n.views || 0,
  nodeCount: n.nodes.length, updatedAt: n.updatedAt,
  preview: { nodes: n.nodes.map((x) => ({ x: x.x, y: x.y, t: x.typeId })), edges: n.edges.map((e) => [e.source, e.target]), ids: n.nodes.map((x) => x.id), types: n.nodeTypes },
});
// "Popular" = likes weighted over raw views, with a mild recency lift.
export const score = (s) => (s.likes || 0) * 8 + (s.views || 0) + Math.max(0, 14 - (now() - (s.updatedAt || 0)) / 86400000);
