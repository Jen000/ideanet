// One place that knows the single-table key layout, so handlers never build
// raw key strings inline.
export const userPk = (userId: string) => `USER#${userId}`;
export const netSk = (netId: string) => `NET#${netId}`;
export const likeSk = (netId: string) => `LIKE#${netId}`;
export const starSk = (netId: string) => `STAR#${netId}`; // private bookmark, distinct from a public like
export const shareSk = (netId: string) => `SHARE#${netId}`; // a network shared *with* this user

export const publicPk = (netId: string) => `PUBLIC#${netId}`;
export const PUBLIC_SK = "NET";

export const GSI_PUBLIC_PK = "VISIBILITY#public";

// User directory: look up a user by email so networks can be shared by email.
export const emailPk = (email: string) => `EMAIL#${email.trim().toLowerCase()}`;
export const DIRECTORY_SK = "USER";

// Comments on a network, sorted oldest-first by a zero-padded timestamp.
export const commentsPk = (netId: string) => `COMMENTS#${netId}`;
export const commentSk = (createdAt: number, id: string) => `${String(createdAt).padStart(15, "0")}#${id}`;

// Edit-history snapshots for a network (owner revert), newest-first when read
// with ScanIndexForward:false. A bounded ring — only the most recent are kept.
export const histPk = (netId: string) => `HIST#${netId}`;
export const histSk = (at: number, id: string) => `${String(at).padStart(15, "0")}#${id}`;
