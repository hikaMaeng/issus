import type {Principal} from '../client/index.js';
import {SessionDraftMemory, sessionDraftScope} from '../../features/session/index.js';

/** Reconfirming the active session must not park defaults ahead of a later real 401. */
export function activateSessionDraft(memory: SessionDraftMemory, current: {principal: Principal|null; scope: string|null}, next: Principal, path: string) {
  const scope = sessionDraftScope(next, path);
  const changed = current.principal?.sessionId !== next.sessionId || current.scope !== scope;
  if (changed) {memory.suspend(current.scope); memory.begin(scope);}
  return {scope, changed};
}
