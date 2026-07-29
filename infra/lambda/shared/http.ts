import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export interface Caller { id: string; name: string; email: string; }

// Identity comes only from the validated JWT claims, never from the body or
// query string — this is what enforces "a user can only touch their own data".
export function caller(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller {
  const claims = (event.requestContext.authorizer?.jwt?.claims ?? {}) as Record<string, string>;
  const id = claims.sub;
  if (!id) throw new HttpError(401, "Not authenticated.");
  return { id, name: claims.name || claims.email || "someone", email: claims.email || "" };
}

export function body<T = any>(event: { body?: string; isBase64Encoded?: boolean }): T {
  if (!event.body) throw new HttpError(400, "Missing request body.");
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Body is not valid JSON.");
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (status: number, data: unknown) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: data === undefined ? "" : JSON.stringify(data),
});

// Wraps a handler so thrown HttpErrors become clean responses and anything
// else becomes a 500 without leaking internals.
export function handle<E>(fn: (event: E) => Promise<{ statusCode: number; headers?: any; body?: string }>) {
  return async (event: E) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error("Unhandled error", err);
      return json(500, { error: "Internal error." });
    }
  };
}
