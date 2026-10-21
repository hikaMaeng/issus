import type express from "express";

/** App-issued identity; account and token persistence belong to the app. */
export interface Principal {
  id: string;
  owner: string;
  alias: string;
  sid: string;
  sessionId: string;
  capabilities: readonly string[];
  kind?: "bootstrap" | "session" | "service";
}
/** Token expiration and revocation are verified by the application. */
export interface SessionVerifier {
  verify(token: string): Promise<Principal>;
  forget(token: string): void | Promise<void>;
}
export type AuthenticatedUser = Principal;
export type AuthedRequest = express.Request & { sessionUser?: Principal; sessionToken?: string };
/** Public injection adapter; performs no remote account requests. */
export function createSessionVerifier(verifier: SessionVerifier): SessionVerifier { return verifier; }
/** Browser cookies require an app-supplied token reader. */
export function readBearer(request: express.Request): string | undefined {
  const header = request.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || undefined : undefined;
}
/** Authenticates before invoking a route without leaking verifier errors. */
export function requireSession(verifier: SessionVerifier, readToken: (request: express.Request) => string | undefined = readBearer): express.RequestHandler {
  return (request: AuthedRequest, response, next) => {
    const token = readToken(request);
    if (!token) { response.status(401).json({ error: { code: "UNAUTHENTICATED" }, posted: false }); return; }
    verifier.verify(token).then((principal) => {
      request.sessionUser = principal; request.sessionToken = token; next();
    }).catch(() => response.status(401).json({ error: { code: "UNAUTHENTICATED" }, posted: false }));
  };
}
