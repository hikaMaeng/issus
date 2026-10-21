import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import type { AgentEnv } from "../env.js";
import type { EventQueueTransport } from "../queue/transport.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import { writeMetrics } from "../metrics/endpoint.js";
import { requireSession, type AuthedRequest, type SessionVerifier, type Principal } from "../auth/index.js";

export interface WebBackendInput {
  /** Opens a replay cursor. Supplied by the broker; the backend does not own the store. */
  openCursor?(channels: string[], from: "start" | "now", principal: Principal): Promise<{ token: string }>;
  /** Decides whether this user may read a channel. The broker has no opinion on ownership. */
  authorizeChannel(channel: string, principal: Principal): boolean | Promise<boolean>;
  env: AgentEnv;
  queue: EventQueueTransport;
  metrics: MetricsRegistry;
  checkDatabase: () => Promise<void>;
  /** Additional application readiness check. Throw or reject to return 503. */
  ready?: () => Promise<void>;
  verifier: SessionVerifier;
  readToken?(request: express.Request): string | undefined;
  /** Runs before all static middleware and its catch-all. */
  extendHttp?(app: express.Express): void;
  /** Client bundle to serve at `/`. Mounted by the deployment, not built in. */
  clientDir?: string;
  /** Files produced by workers, served read-only at `/workspace`. */
  assetDir?: string;
}

/**
 * The broker's HTTP surface, kept as small as the role allows.
 *
 * The broker transports events; it does not process them. HTTP therefore does
 * only what a socket cannot: prove who is calling, and hand over bytes. Both
 * directories it serves are supplied by configuration — the broker never learns
 * what application they belong to.
 */
export function createWebBackend(input: WebBackendInput): express.Express {
  const app = express();
  const authed = requireSession(input.verifier, input.readToken);

  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_request, response) => response.json({ status: "ok", service: "broker" }));
  app.get("/ready", async (_request, response) => {
    try { await Promise.all([input.queue.check(), input.checkDatabase(), input.ready?.()]); response.json({ status: "ready" }); }
    catch { response.status(503).json({ status: "unavailable" }); }
  });
  app.get("/metrics", (request, response) => { writeMetrics(request, response, input.env, input.metrics); });

  /**
   * Opens a replay cursor for channels this user may read.
   *
   * A plain subscription starts at the current high-water mark, which is right
   * for a live view and wrong for reopening a past conversation. This is the
   * only way to ask for the other one, and it stays generic: the broker does
   * not know what a channel means, only whether the caller may read it.
   */
  app.post("/api/channels/cursor", authed, async (request: AuthedRequest, response) => {
    if (!input.openCursor) { response.status(501).json({ error: "cursor opening is not enabled" }); return; }
    const body = request.body as { channels?: unknown; from?: unknown };
    const channels = Array.isArray(body?.channels) && body.channels.length <= 32 && body.channels.every((c) => typeof c === "string" && c.length > 0 && c.length <= 128) ? [...new Set(body.channels as string[])] : [];
    if (!channels.length) { response.status(400).json({ error: "channels is required" }); return; }
    const user = request.sessionUser!;
    try {
    if (!(await Promise.all(channels.map((channel) => input.authorizeChannel(channel, user)))).every(Boolean)) {
      response.status(403).json({ error: "channel does not belong to this user" });
      return;
    }
      const { token } = await input.openCursor(channels, body.from === "start" ? "start" : "now", user);
      response.status(201).json({ cursor: token, channels });
    } catch (error) {
      response.status(503).json({ error: { code: "CURSOR_UNAVAILABLE" }, posted: false });
    }
  });

  input.extendHttp?.(app);

  // Worker output. Read-only, and only reachable once the directory exists —
  // a missing mount should surface as 404 rather than crash the broker.
  if (input.assetDir && existsSync(input.assetDir)) {
    app.use("/workspace", express.static(input.assetDir, { index: "index.html", dotfiles: "ignore" }));
  }

  const clientDir = input.clientDir;
  if (clientDir) {
    app.use(express.static(clientDir));
    app.get("/{*path}", (_request, response) => response.sendFile(path.join(clientDir, "index.html")));
  }
  return app;
}
