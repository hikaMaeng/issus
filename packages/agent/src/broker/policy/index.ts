import type { IncomingMessage } from "node:http";
import type { GatewaySocketHooks, GatewaySocketPolicy } from "../transport/websocket.js";
import type { Principal, SessionVerifier } from "../auth/index.js";

export interface SocketPolicyInput extends GatewaySocketHooks {
  verifier: SessionVerifier;
  allowedActions: readonly string[];
  authorizeChannel(channel: string, principal: Principal): boolean | Promise<boolean>;
  replyChannelFor?(sessionId: string): string;
  /** Cookie extraction is app-owned. Query bearer tokens are never read. */
  readToken?(request: IncomingMessage): string | undefined;
  readyChannels?(principal: Principal): readonly string[];
}
/** Applies injected identity, scope and deployment action policy to all frames. */
export function createSocketPolicy(input: SocketPolicyInput): GatewaySocketPolicy {
  const allowed = new Set(input.allowedActions);
  return {
    async verifyUpgrade(request) {
      const header = request.headers.authorization;
      const token = input.readToken ? input.readToken(request) : typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
      if (!token) return null;
      try { return { principal: await input.verifier.verify(token), token }; } catch { return null; }
    },
    async revalidate(context) {
      if (!context.token) return false;
      try {
        const principal = await input.verifier.verify(context.token);
        return principal.id === context.principal.id && principal.owner === context.principal.owner && principal.sessionId === context.principal.sessionId;
      } catch { return false; }
    },
    authorizeChannel: input.authorizeChannel,
    readyChannels: input.readyChannels,
    onSubscribe: input.onSubscribe,
    onReceipt: input.onReceipt,
    onDisconnect: input.onDisconnect,
    onSendSuccess: input.onSendSuccess,
    watchRevocation: input.watchRevocation,
    selectProtocol: input.selectProtocol,
    initialSubscribe: input.initialSubscribe,
    guardIngress(frame, context) {
      const principal = context.principal;
      if (!allowed.has(frame.action) || !frame.transactionKey || frame.sessionId !== principal.sessionId) return null;
      return { ...frame, sessionId: principal.sessionId, replyChannel: input.replyChannelFor?.(principal.sessionId) ?? `session:${principal.sessionId}` };
    },
  };
}
