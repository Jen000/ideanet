/**
 * AWS adapter.
 *
 *   auth      Cognito user pool  (amazon-cognito-identity-js, SRP flow)
 *   networks  DynamoDB via our HTTP API,  owner-scoped by the caller's JWT
 *   gallery   DynamoDB GSI via open HTTP API routes (readable without auth)
 *
 * Return shapes are identical to ./local.js — nothing in the UI knows which
 * adapter it's talking to. Config is Vite env only; see ../../.env.example.
 *
 * Why amazon-cognito-identity-js over @aws-sdk/client-cognito-identity-provider:
 * it runs the SRP password flow and stores/refreshes tokens in the browser
 * with no client secret, which is exactly what a public SPA needs. The ID
 * token it issues is what our API Gateway JWT authorizer validates. The AWS
 * SDK client would make us hand-roll SRP and token storage for no gain.
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from "amazon-cognito-identity-js";
import { summarize, score } from "./local";

const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

if (!USER_POOL_ID || !CLIENT_ID || !API) {
  // Warn in dev rather than throwing cryptic errors on the first call.
  console.warn("[api/aws] missing VITE_ config — see .env.example");
}

const pool = new CognitoUserPool({ UserPoolId: USER_POOL_ID, ClientId: CLIENT_ID });

/* --------------------------------------------------------------------- auth */
const publicUser = (session) => {
  const p = session.getIdToken().payload;
  return { id: p.sub, name: p.name || (p.email ? p.email.split("@")[0] : "you"), email: p.email };
};

// The current valid ID token, or null when signed out. getSession refreshes it
// transparently if it has expired but the refresh token is still good.
const idToken = () =>
  new Promise((resolve) => {
    const u = pool.getCurrentUser();
    if (!u) return resolve(null);
    u.getSession((err, session) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });

/* ---------------------------------------------------------------- http calls */
async function call(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) {
    const jwt = await idToken();
    if (!jwt) throw new Error("Please sign in.");
    headers.authorization = `Bearer ${jwt}`;
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  async signUp(name, email, password) {
    const key = email.trim().toLowerCase();
    if (!key || !password) throw new Error("Enter an email and a password.");
    const attrs = [
      new CognitoUserAttribute({ Name: "email", Value: key }),
      new CognitoUserAttribute({ Name: "name", Value: name.trim() || key.split("@")[0] }),
    ];
    await new Promise((resolve, reject) => {
      pool.signUp(key, password, attrs, null, (err, result) => (err ? reject(asError(err)) : resolve(result)));
    });
    // The pre-signup trigger auto-confirms, so we can sign in straight away.
    return api.signIn(key, password);
  },

  async signIn(email, password) {
    const key = email.trim().toLowerCase();
    const user = new CognitoUser({ Username: key, Pool: pool });
    const details = new AuthenticationDetails({ Username: key, Password: password });
    const session = await new Promise((resolve, reject) => {
      user.authenticateUser(details, { onSuccess: resolve, onFailure: (err) => reject(asError(err)) });
    });
    api.syncProfile().catch(() => {}); // register in the directory so others can share by email
    return publicUser(session);
  },

  async signOut() {
    const u = pool.getCurrentUser();
    if (u) u.signOut();
  },

  async currentUser() {
    return new Promise((resolve) => {
      const u = pool.getCurrentUser();
      if (!u) return resolve(null);
      u.getSession((err, session) => {
        if (err || !session || !session.isValid()) return resolve(null);
        resolve(publicUser(session));
      });
    });
  },

  // Record the signed-in user in the directory so others can share by email.
  async syncProfile() {
    const jwt = await idToken();
    if (!jwt) return null;
    return call("/me", { method: "POST" });
  },

  /* --------------------------------------------- the signed-in user's networks */
  async myNetworks() {
    return call("/networks");
  },
  // Open any network the caller can access; returns { net, role }. saveNetwork
  // sends net.updatedAt as-is, which the server uses as the stale-edit base.
  async openNetwork(id) {
    try {
      return await call(`/networks/${encodeURIComponent(id)}`);
    } catch (err) {
      // A backend that predates this route returns 404 — and because a missing
      // route carries no CORS headers, the browser surfaces it as a network
      // error with no status. Either way, fall back to the owner's own list so
      // your networks keep opening. /networks is a real route (has CORS), so
      // this fallback succeeds when the per-id route doesn't exist yet.
      const mine = await call("/networks").catch(() => null);
      const net = mine && mine.find((n) => n.id === id);
      if (net) return { net, role: "owner" };
      throw err;
    }
  },
  async saveNetwork(net) {
    return call(`/networks/${encodeURIComponent(net.id)}`, { method: "PUT", body: net });
  },
  async deleteNetwork(id) {
    await call(`/networks/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /* ------------------------------------------------------- sharing & roles */
  async sharedWithMe() {
    const jwt = await idToken();
    if (!jwt) return [];
    // Fail soft: if the route isn't deployed yet, the dashboard still loads.
    try { return await call("/shared"); } catch { return []; }
  },
  async collaborators(id) {
    return call(`/networks/${encodeURIComponent(id)}/collaborators`);
  },
  async shareNetwork(id, email, role) {
    return call(`/networks/${encodeURIComponent(id)}/collaborators`, { method: "POST", body: { email, role } });
  },
  async unshareNetwork(id, userId) {
    await call(`/networks/${encodeURIComponent(id)}/collaborators/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },

  /* -------------------------------------------------------------- comments */
  async comments(id) {
    const jwt = await idToken();
    if (!jwt) return []; // v1: comments are visible to signed-in viewers
    try { return await call(`/networks/${encodeURIComponent(id)}/comments`); } catch { return []; }
  },
  async addComment(id, text) {
    return call(`/networks/${encodeURIComponent(id)}/comments`, { method: "POST", body: { text } });
  },
  async deleteComment(id, commentId) {
    await call(`/networks/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
  },

  /* --------------------------------------------------------- public gallery */
  async gallery() {
    return call("/gallery", { auth: false });
  },
  async openPublic(id) {
    try {
      return await call(`/public/${encodeURIComponent(id)}`, { auth: false });
    } catch (err) {
      if (err.status === 404) return null; // mirrors local: unknown id -> null
      throw err;
    }
  },
  async unpublish(id) {
    await call(`/networks/${encodeURIComponent(id)}/unpublish`, { method: "POST" });
  },

  /* --------------------------------------------------------------- engagement */
  // Sign-in-gated: liking requires an account. When signed out this is a no-op
  // that reports the block, so the UI leaves the count and heart untouched
  // (no component change — the viewer never wired up a sign-in prompt).
  async toggleLike(id) {
    const jwt = await idToken();
    if (!jwt) throw new Error("Sign in to like networks.");
    return call(`/networks/${encodeURIComponent(id)}/like`, { method: "POST" });
  },
  async likedIds() {
    // Per-user on the server. Anonymous visitors have liked nothing.
    const jwt = await idToken();
    if (!jwt) return [];
    return call("/likes");
  },
  // Stars are private bookmarks — "save to come back to" — separate from likes.
  async toggleStar(id) {
    const jwt = await idToken();
    if (!jwt) throw new Error("Sign in to save networks.");
    return call(`/networks/${encodeURIComponent(id)}/star`, { method: "POST" });
  },
  async starredIds() {
    const jwt = await idToken();
    if (!jwt) return [];
    return call("/stars");
  },
  async starred() {
    // Card summaries for the caller's bookmarks. Signed-in only.
    const jwt = await idToken();
    if (!jwt) return [];
    return call("/starred");
  },

  // Seeding is demo-only in the local adapter; on AWS it's a no-op.
  async ensureSeed() {},
};

// Cognito errors carry a readable .message; normalize anything odd to an Error.
function asError(err) {
  return err instanceof Error ? err : new Error(err?.message || "Authentication failed.");
}

export { summarize, score } from "./local";
