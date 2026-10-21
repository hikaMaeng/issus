import type {Principal} from '../../entry/client/index.js';

/** Separate identities, session FROM values, and exact internal page scopes. */
export function sessionDraftScope(principal: Principal|null, path: string): string|null {
  if (principal?.kind !== 'session' || !principal.alias || !principal.sid || !(principal.ownerId || principal.owner)) return null;
  return JSON.stringify([principal.ownerId ?? principal.owner, principal.alias, principal.sid, path]);
}

/** In-memory, opt-in slots only. Authentication credentials and request state have no slots. */
export class SessionDraftMemory {
  private working = new Map<string, Map<string, unknown>>();
  private pending = new Map<string, Map<string, unknown>>();
  private leases = new Map<string, object>();

  /** A newly authenticated view starts fresh until an explicit restore. */
  begin(scope: string|null): void {if (scope) {this.working.set(scope, new Map()); this.leases.set(scope, {});}}

  /** A mounted form's lease cannot write into a later authentication/recovery generation. */
  lease(scope: string): object|undefined {return this.leases.get(scope);}

  /** Preserve a pending recovery even if a second 401 arrives from the discarded view. */
  suspend(scope: string|null): void {
    if (!scope) return;
    const current = this.working.get(scope);
    if (current?.size && !this.pending.has(scope)) this.pending.set(scope, new Map(current));
    this.working.delete(scope);
    this.leases.delete(scope);
  }

  /** Writes stay in the current working view and cannot overwrite pending recovery. */
  write<T>(scope: string, slot: string, value: T, lease?: object): void {
    if (lease && lease !== this.leases.get(scope)) return;
    this.working.get(scope)?.set(slot, value);
  }

  /** Read only the active view; pending data is invisible before explicit restoration. */
  initial<T>(scope: string, slot: string, fallback: () => T): T {
    const active = this.working.get(scope);
    return active?.has(slot) ? active.get(slot) as T : fallback();
  }

  /** Only a matching principal/page can discover or restore its suspended draft. */
  hasPending(scope: string|null): boolean {return !!scope && !!this.pending.get(scope)?.size;}

  /** Restore all related slots together, including an edit's original revision baseline. */
  restore(scope: string|null): boolean {
    if (!scope) return false;
    const saved = this.pending.get(scope);
    if (!saved?.size) return false;
    this.working.set(scope, new Map(saved)); this.leases.set(scope, {}); this.pending.delete(scope);
    return true;
  }

  /** Explicit discard affects only this principal/page. */
  discard(scope: string|null): void {if (scope) this.pending.delete(scope);}
}
