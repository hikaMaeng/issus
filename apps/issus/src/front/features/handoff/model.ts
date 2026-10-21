import type {Principal} from '../../entry/client/index.js';
/** Stage controls never infer acceptance from an ACK or timeout. State is supplied by the server. */
export function handoffPermissions(principal: Principal|null|undefined, owner: string, recipient?: string, status?: string) {
  const isOwner = principal?.kind === 'bootstrap' || !!principal?.alias && principal.alias.toLowerCase() === owner.toLowerCase();
  return {write: isOwner && !!principal?.alias, accept: principal?.kind === 'session' && !!recipient && principal.alias?.toLowerCase() === recipient.toLowerCase() && status === 'pending', complete: isOwner && status === 'accepted'};
}
