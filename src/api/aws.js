/**
 * AWS adapter — NOT IMPLEMENTED YET.
 *
 * This file is the contract. Implement each function against:
 *   auth      Cognito user pool
 *   networks  DynamoDB, PK=USER#<userId>  SK=NET#<netId>
 *   gallery   DynamoDB GSI, PK=VISIBILITY#public, SK=<score>#<netId>
 *
 * Keep the signatures and return shapes identical to ./local.js. Nothing in
 * the UI knows which adapter it's talking to, and it should stay that way.
 *
 * Shapes:
 *   User     { id, name, email }
 *   Network  { id, title, description, tags[], ownerId, ownerName,
 *              visibility: "public"|"private", nodeTypes[], nodes[], edges[],
 *              likes, views, createdAt, updatedAt }
 *   Summary  see summarize() in ./local.js — this is what the gallery lists
 */

export const api = {
  // --- auth (Cognito) -------------------------------------------------------
  async signUp(name, email, password) { throw new Error("not implemented"); },   // -> User
  async signIn(email, password) { throw new Error("not implemented"); },          // -> User
  async signOut() { throw new Error("not implemented"); },                        // -> void
  async currentUser() { throw new Error("not implemented"); },                    // -> User | null

  // --- the signed-in user's own networks (Dynamo, owner-scoped) -------------
  async myNetworks() { throw new Error("not implemented"); },                     // -> Network[]
  async saveNetwork(net) { throw new Error("not implemented"); },                 // -> Network
  async deleteNetwork(id) { throw new Error("not implemented"); },                // -> void

  // --- public gallery (Dynamo GSI, readable without auth) ------------------
  async gallery() { throw new Error("not implemented"); },                        // -> Summary[]
  async openPublic(id) { throw new Error("not implemented"); },                   // -> Network | null
  async unpublish(id) { throw new Error("not implemented"); },                    // -> void

  // --- engagement -----------------------------------------------------------
  // NOTE: openPublic() increments a view count. Writing that straight to
  // Dynamo on every read will contend badly once a network gets popular.
  // Decide before launch: buffer through Kinesis/SQS and roll up, or accept
  // an eventually-consistent counter.
  async toggleLike(id) { throw new Error("not implemented"); },                   // -> { liked, likes }
  async likedIds() { throw new Error("not implemented"); },                       // -> string[]

  // --- seeding --------------------------------------------------------------
  // Demo-only in the local adapter. On AWS this should be a no-op.
  async ensureSeed() {},
};

export { summarize, score } from "./local";
