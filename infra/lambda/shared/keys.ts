// One place that knows the single-table key layout, so handlers never build
// raw key strings inline.
export const userPk = (userId: string) => `USER#${userId}`;
export const netSk = (netId: string) => `NET#${netId}`;
export const likeSk = (netId: string) => `LIKE#${netId}`;
export const starSk = (netId: string) => `STAR#${netId}`; // private bookmark, distinct from a public like

export const publicPk = (netId: string) => `PUBLIC#${netId}`;
export const PUBLIC_SK = "NET";

export const GSI_PUBLIC_PK = "VISIBILITY#public";
