import { DEFAULT_TYPES, uid, now } from "../constants";
import { validateNetwork } from "./limits";

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
  // No email step in the demo store — signUp already signed you in. These exist
  // so the UI can call the same surface as the AWS adapter.
  async confirmSignUp(email, code, password) { return password ? api.signIn(email, password) : true; },
  async resendCode() { return true; },
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
  // Directory is the accounts map here, so nothing to sync.
  async syncProfile() { return null; },

  /* --------------------------------------------------------- account settings */
  async changeUsername(name) {
    const clean = (name || "").trim();
    if (!clean) throw new Error("Enter a username.");
    if (clean.length > 60) throw new Error("Username is too long (max 60).");
    const s = await store.get("session");
    const accounts = (await store.get("accounts")) || {};
    const taken = Object.values(accounts).some((u) => u.email !== s?.email && (u.name || "").toLowerCase() === clean.toLowerCase());
    if (taken) throw new Error("That username is taken.");
    if (accounts[s?.email]) { accounts[s.email].name = clean; await store.set("accounts", accounts); }
    // propagate onto the user's own networks + public copies
    const all = (await store.get("mynets")) || {};
    for (const id in all) {
      if (all[id].ownerId !== s?.userId) continue;
      all[id] = { ...all[id], ownerName: clean };
      await store.set(`mirror:${id}`, all[id], true);
      const pub = await store.get(`pub:${id}`, true);
      if (pub) { await store.set(`pub:${id}`, { ...pub, ownerName: clean }, true); const idx = (await store.get("pubindex", true)) || {}; if (idx[id]) { idx[id] = { ...summarize(all[id]), likes: idx[id].likes, views: idx[id].views }; await store.set("pubindex", idx, true); } }
    }
    await store.set("mynets", all);
    return { name: clean };
  },
  async changeEmail(newEmail) {
    const key = (newEmail || "").trim().toLowerCase();
    if (!key) throw new Error("Enter an email.");
    const s = await store.get("session");
    const accounts = (await store.get("accounts")) || {};
    if (accounts[key] && key !== s?.email) throw new Error("That email is already in use.");
    const me = accounts[s?.email];
    if (me) { delete accounts[s.email]; me.email = key; accounts[key] = me; await store.set("accounts", accounts); await store.set("session", { userId: me.id, email: key }); }
    return { needsVerification: false, email: key }; // demo store skips the email step
  },
  async verifyEmail() { return true; },
  async deleteAccount() {
    const s = await store.get("session");
    const me = s?.userId;
    const all = (await store.get("mynets")) || {};
    for (const id in all) {
      if (all[id].ownerId !== me) continue;
      await api.unpublish(id);
      await store.set(`mirror:${id}`, null, true);
      await store.set(`hist:${id}`, [], true);
    }
    await store.set("mynets", {});
    const accounts = (await store.get("accounts")) || {};
    if (s?.email) delete accounts[s.email];
    await store.set("accounts", accounts);
    await store.set("session", null);
    return true;
  },
  async myNetworks() {
    const s = await store.get("session");
    const me = s?.userId;
    const all = (await store.get("mynets")) || {};
    return Object.values(all).filter((n) => !me || n.ownerId === me).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  // Open any accessible network with the caller's role (owner / editor / viewer).
  async openNetwork(id) {
    const s = await store.get("session");
    const me = s?.userId;
    const all = (await store.get("mynets")) || {};
    // Reflect the gallery's live view count so the editor matches the public copy.
    const idx = (await store.get("pubindex", true)) || {};
    const withViews = (net) => (net && idx[net.id] ? { ...net, views: idx[net.id].views ?? net.views ?? 0 } : net);
    const mirror = await store.get(`mirror:${id}`, true);
    if (all[id] && all[id].ownerId === me) {
      // The mirror is the shared canonical (matches the single DynamoDB item): an
      // editor's change to an open net lives there, so prefer it when it's newer.
      const canonical = mirror && (mirror.updatedAt || 0) >= (all[id].updatedAt || 0) ? mirror : all[id];
      return { net: withViews(canonical), role: "owner" };
    }
    const shares = (await store.get(`shares:${id}`, true)) || [];
    const mine = shares.find((c) => c.userId === me);
    if (mine && mirror) return { net: withViews(mirror), role: mine.role };
    // Open tier: any signed-in user may edit a network marked "open".
    if (me && mirror && mirror.visibility === "open") return { net: withViews(mirror), role: "editor" };
    if (all[id]) return { net: withViews(all[id]), role: "owner" };
    return null;
  },
  async saveNetwork(net) {
    validateNetwork(net);
    const s = await store.get("session");
    const me = s?.userId;
    const prev = await store.get(`mirror:${net.id}`, true); // state we're about to replace
    const meName = await myName(s);
    const stamped = { ...net, ownerId: net.ownerId || me, lastEditorId: me, lastEditorName: meName, updatedAt: now() };
    // Owner keeps it in their own list; an editor only updates the shared copy.
    if (stamped.ownerId === me) {
      const all = (await store.get("mynets")) || {};
      all[net.id] = stamped;
      await store.set("mynets", all);
    }
    await store.set(`mirror:${net.id}`, stamped, true); // cross-account canonical
    if (stamped.visibility === "public" || stamped.visibility === "open") {
      await store.set(`pub:${net.id}`, stamped, true);
      const idx = (await store.get("pubindex", true)) || {};
      idx[net.id] = { ...summarize(stamped), likes: idx[net.id]?.likes ?? 0, views: idx[net.id]?.views ?? 0 };
      await store.set("pubindex", idx, true);
    } else {
      await api.unpublish(net.id);
    }
    // Keep a revertible trail for open networks. Always snapshot on a handoff to
    // a different editor; throttle rapid saves by the same person.
    if (prev && prev.visibility === "open")
      await snapshotLocal(net.id, prev, prev.lastEditorName || prev.ownerName || "someone", prev.lastEditorId || "", prev.lastEditorId !== me);
    return stamped;
  },
  async history(id) {
    const list = (await store.get(`hist:${id}`, true)) || [];
    return list.map((h) => ({ id: h.id, at: h.at, by: h.by, nodeCount: (h.net.nodes || []).length }));
  },
  async revert(id, snapshotId) {
    const s = await store.get("session");
    const me = s?.userId;
    const all = (await store.get("mynets")) || {};
    if (!(all[id] && all[id].ownerId === me)) throw new Error("Only the owner can revert this network.");
    const list = (await store.get(`hist:${id}`, true)) || [];
    const snap = list.find((h) => h.id === snapshotId);
    if (!snap) throw new Error("That version no longer exists.");
    const cur = (await store.get(`mirror:${id}`, true)) || all[id];
    if (cur) await snapshotLocal(id, cur, await myName(s), me, true); // force: make the revert undoable
    const restored = { ...snap.net, id, ownerId: cur?.ownerId ?? me, ownerName: cur?.ownerName, collaborators: cur?.collaborators || [], visibility: cur?.visibility, likes: cur?.likes || 0, views: cur?.views || 0, createdAt: cur?.createdAt, updatedAt: now() };
    all[id] = restored;
    await store.set("mynets", all);
    await store.set(`mirror:${id}`, restored, true);
    if (restored.visibility === "public" || restored.visibility === "open") {
      await store.set(`pub:${id}`, restored, true);
      const idx = (await store.get("pubindex", true)) || {};
      idx[id] = { ...summarize(restored), likes: idx[id]?.likes ?? 0, views: idx[id]?.views ?? 0 };
      await store.set("pubindex", idx, true);
    }
    return { net: restored, role: "owner" };
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
    // Tear down any shares of this network.
    const shares = (await store.get(`shares:${id}`, true)) || [];
    for (const c of shares) {
      const mem = ((await store.get(`member:${c.userId}`, true)) || []).filter((x) => x !== id);
      await store.set(`member:${c.userId}`, mem, true);
    }
    await store.set(`shares:${id}`, [], true);
    await store.set(`hist:${id}`, [], true);
  },

  /* ------------------------------------------------------- sharing & roles */
  async sharedWithMe() {
    const s = await store.get("session");
    const me = s?.userId;
    if (!me) return [];
    const ids = (await store.get(`member:${me}`, true)) || [];
    const out = [];
    for (const id of ids) {
      const net = await store.get(`mirror:${id}`, true);
      const shares = (await store.get(`shares:${id}`, true)) || [];
      const mine = shares.find((c) => c.userId === me);
      if (net && mine) out.push({ ...summarize(net), role: mine.role });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async collaborators(id) {
    return (await store.get(`shares:${id}`, true)) || [];
  },
  async shareNetwork(id, email, role) {
    const key = email.trim().toLowerCase();
    const accounts = (await store.get("accounts")) || {};
    const target = accounts[key];
    if (!target) throw new Error("No IdeaNet user with that email — they need an account first.");
    const s = await store.get("session");
    if (target.id === s?.userId) throw new Error("You already own this network.");
    const collab = { userId: target.id, email: key, name: target.name, role: role === "editor" ? "editor" : "viewer" };
    const shares = ((await store.get(`shares:${id}`, true)) || []).filter((c) => c.userId !== target.id);
    shares.push(collab);
    await store.set(`shares:${id}`, shares, true);
    const mem = (await store.get(`member:${target.id}`, true)) || [];
    if (!mem.includes(id)) { mem.push(id); await store.set(`member:${target.id}`, mem, true); }
    // reflect on the owner's copy + mirror
    const all = (await store.get("mynets")) || {};
    if (all[id]) {
      all[id] = { ...all[id], collaborators: shares };
      await store.set("mynets", all);
      await store.set(`mirror:${id}`, all[id], true);
    }
    return collab;
  },
  async unshareNetwork(id, userId) {
    const shares = ((await store.get(`shares:${id}`, true)) || []).filter((c) => c.userId !== userId);
    await store.set(`shares:${id}`, shares, true);
    const mem = ((await store.get(`member:${userId}`, true)) || []).filter((x) => x !== id);
    await store.set(`member:${userId}`, mem, true);
    const all = (await store.get("mynets")) || {};
    if (all[id]) {
      all[id] = { ...all[id], collaborators: shares };
      await store.set("mynets", all);
      await store.set(`mirror:${id}`, all[id], true);
    }
  },

  /* -------------------------------------------------------------- comments */
  async comments(id) {
    return (await store.get(`comments:${id}`, true)) || [];
  },
  async addComment(id, text) {
    const s = await store.get("session");
    const accounts = (await store.get("accounts")) || {};
    const me = accounts[s?.email];
    const t = (text || "").trim().slice(0, 2000);
    if (!t) throw new Error("Comment can't be empty.");
    const comment = { id: uid("c"), netId: id, authorId: s?.userId, authorName: me?.name || "you", text: t, createdAt: now() };
    const list = (await store.get(`comments:${id}`, true)) || [];
    list.push(comment);
    await store.set(`comments:${id}`, list, true);
    return comment;
  },
  async deleteComment(id, commentId) {
    const list = ((await store.get(`comments:${id}`, true)) || []).filter((c) => c.id !== commentId);
    await store.set(`comments:${id}`, list, true);
  },
  async gallery() {
    const idx = (await store.get("pubindex", true)) || {};
    const items = Object.values(idx).sort((a, b) => score(b) - score(a));
    // Attach the live comment count so cards can show it (backend does this via
    // a denormalised counter on the public copy).
    const out = [];
    for (const s of items) {
      const cs = (await store.get(`comments:${s.id}`, true)) || [];
      out.push({ ...s, comments: cs.length });
    }
    return out;
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

  // Stars are private bookmarks — "save to come back to" — separate from likes.
  async toggleStar(id) {
    const list = (await store.get("starred")) || [];
    const on = list.includes(id);
    const next = on ? list.filter((x) => x !== id) : [...list, id];
    await store.set("starred", next);
    return { starred: !on };
  },
  async starredIds() {
    return (await store.get("starred")) || [];
  },
  async starred() {
    const ids = (await store.get("starred")) || [];
    const idx = (await store.get("pubindex", true)) || {};
    const mine = (await store.get("mynets")) || {};
    // Resolve each bookmark to a public summary, or the caller's own network.
    // Newest bookmark first; ids that resolve to neither drop out.
    return [...ids].reverse().map((id) => idx[id] || (mine[id] && summarize(mine[id]))).filter(Boolean);
  },
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

// Display name for the current session, for tagging history snapshots.
async function myName(session) {
  const accounts = (await store.get("accounts")) || {};
  return accounts[session?.email]?.name || "someone";
}

// Push a bounded, throttled edit snapshot (newest first) for a network.
async function snapshotLocal(id, net, by, byId, force = false) {
  const key = `hist:${id}`;
  const list = (await store.get(key, true)) || [];
  const lastAt = list.length ? list[0].at : 0;
  if (!force && Date.now() - lastAt < 30000) return;
  list.unshift({ id: uid("h"), at: Date.now(), by, byId, net });
  await store.set(key, list.slice(0, 20), true);
}
export const summarize = (n) => ({
  id: n.id, title: n.title, description: n.description, tags: n.tags,
  author: n.ownerName, likes: n.likes || 0, views: n.views || 0, visibility: n.visibility,
  nodeCount: n.nodes.length, updatedAt: n.updatedAt,
  preview: { nodes: n.nodes.map((x) => ({ x: x.x, y: x.y, t: x.typeId })), edges: n.edges.map((e) => [e.source, e.target]), ids: n.nodes.map((x) => x.id), types: n.nodeTypes },
});
// "Popular" = likes weighted over raw views, with a mild recency lift.
export const score = (s) => (s.likes || 0) * 8 + (s.views || 0) + Math.max(0, 14 - (now() - (s.updatedAt || 0)) / 86400000);
