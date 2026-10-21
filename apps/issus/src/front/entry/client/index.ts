import {IssusClient, ClientError, OperationTimeout, issuePath, repoPath, InboxModel} from 'issus_domain/front';
import type {InboxResponse} from 'issus_domain/common';
import type {ClientOptions, RequestOptions, HttpResponse} from 'issus_domain/front';
import {ko} from '../../resources/index.js';

export {issuePath, repoPath, ClientError, OperationTimeout, InboxModel};
export interface Principal {alias?: string; sid?: string; kind?: string; owner?: string; ownerId?: string; sessionId?: string; expiresAt?: string}
export interface CommentView {id: string; body: string; envelope: Record<string,string>; createdAt?: string; validity?: string}
export interface IssueView {issue: {number: number; title: string; isOpen: boolean; state: string}; body: string; envelope: Record<string,string>; revision: number}
export interface History {items: CommentView[]; compact: CommentView|null; nextCursor: string|null}
export interface Page<T> {items: T[]; nextCursor: string|null}
export interface RepoView {id: string; owner: string; slug: string}
export interface IssueSummary {number: number; title: string; state: string; isOpen: boolean; ownerAliasId?: string; owner?: string; ownerAlias?: string; isBoard?: boolean; compactId?: string|null; compact?: string|null; updatedAt?: string}
export interface ValidationReason {code: string; path: string; message: string}
const csrfKey = 'issus.csrf';

/** Raw server diagnostics remain available beside the P7-compatible message array. */
export class FrontClientError extends ClientError {
  constructor(status: number, code: string, readonly validationReasons: readonly ValidationReason[] = [], details?: Record<string,unknown>, messages?: string[]) {
    super(status, code, messages ?? validationReasons.map(reason => reason.message), details);
  }
}

/** Preserve structured errors for direct responses and completed asynchronous operations. */
export class BrowserClient extends IssusClient {
  constructor(options: ClientOptions) {
    const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
    super({...options, fetch: async (url, init) => {
      const response = await transport(url, init);
      if (!response.ok) {
        let data: {error?: {code?: string; message?: string; reasons?: ValidationReason[]; details?: Record<string,unknown>}};
        try {data = await response.clone().json();} catch {return response;}
        if (data.error) throw new FrontClientError(response.status, data.error.code ?? `HTTP_${response.status}`, data.error.reasons, data.error.details, data.error.reasons?.map(r => r.message) ?? (data.error.message ? [data.error.message] : []));
      }
      return response;
    }});
  }
  override async request<T = Record<string,unknown>>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    try {
      const result = await super.request<T>(path, options);
      if (this.url(path).pathname.startsWith('/v1/operations/')) {
        const operation = result.data as {httpStatus?: number; status?: string; error?: {code: string; reasons?: ValidationReason[]; details?: Record<string,unknown>}; response?: {error?: {code: string; reasons?: ValidationReason[]; details?: Record<string,unknown>}}};
        const error = operation.error ?? operation.response?.error;
        if (error && operation.httpStatus && operation.httpStatus >= 400 && !['queued', 'running'].includes(operation.status ?? '')) throw new FrontClientError(operation.httpStatus, error.code, error.reasons, error.details);
      }
      return result;
    } catch (error) {
      if (!this.headers().Authorization && error instanceof ClientError && error.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('issus:unauthenticated'));
      throw error;
    }
  }
}

/** Only CSRF is persisted; bearer values never enter browser storage. */
export function hasBrowserCsrf(): boolean {return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(csrfKey);}
/** Clear the local proof and notify subscribers; server revocation remains an explicit API call. */
export function clearBrowserSession(): void {sessionStorage.removeItem(csrfKey); window.dispatchEvent(new Event('issus:unauthenticated'));}

/** Cookie authentication is same-origin; bearer is held only for the initial exchange. */
export function createBrowserClient(token?: string): BrowserClient {
  return new BrowserClient({server: window.location.origin, token, fetch: (url, init = {}) => {
    const headers = new Headers(init.headers);
    const csrf = sessionStorage.getItem(csrfKey);
    if (!token && !csrf && !['GET','HEAD','OPTIONS'].includes(init.method ?? 'GET')) throw new FrontClientError(403, 'CSRF_MISSING', [{code: 'CSRF_MISSING', path: 'session', message: ko.csrfMissing}]);
    if (csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET')) headers.set('X-CSRF-Token', csrf);
    return fetch(url, {...init, headers, credentials: 'same-origin'});
  }});
}

/** Error paragraphs preserve exact server ordering; field association is auxiliary only. */
export function errorReasons(error: unknown): readonly ValidationReason[] {return error instanceof FrontClientError ? error.validationReasons : [];}
/** Map only exact protocol field paths or the canonical required-key diagnostic. */
export function reasonField(reason: ValidationReason): string|undefined {
  const field = /^envelope\.(FROM|TO|TYPE|CC|RE|STATE|DUE|ACK-BY|SEEN|SUPERSEDES|REPLY-IN|MIRROR-OF|GATE|DESTRUCTIVE)$/.exec(reason.path)?.[1];
  if (field) return field;
  if (['compactPacketToken','sampledIds','compactedBy','compactDeferredReason'].includes(reason.path)) return reason.path;
  if (reason.path === 'body') return /^지시성 TYPE (?:ASK|HOLD|DECISION|HANDOFF): (ACK-BY) 필수$/.exec(reason.message)?.[1];
  return undefined;
}

/** Exchanges the session bearer once; no bearer is persisted to browser storage. */
export async function connectBrowser(token: string): Promise<void> {
  const client = createBrowserClient(token);
  const response = await client.write<{csrfToken: string}>('/v1/auth/browser-session', {method: 'POST', key: crypto.randomUUID(), body: {}});
  sessionStorage.setItem(csrfKey, response.csrfToken);
}

/** Preserves each server reason's spelling and order, including 422 diagnostics. */
export function errorLines(error: unknown): string[] {
  if (error instanceof OperationTimeout) return [ko.operationPending(error.operationId)];
  if (error instanceof ClientError) return [...(error.reasons.length ? error.reasons : [ko.error(error.code)]), ...(error.details ? [JSON.stringify(error.details, null, 2)] : [])];
  return [ko.failure];
}

/** Consume every page without inferring processed progress from what was displayed. */
export async function allPages<T>(client: IssusClient, path: string, signal: AbortSignal, onProgress?: (count: number) => void): Promise<T[]> {
  const items: T[] = [], seen = new Set<string>();
  let cursor: string|null = null;
  do {
    const url = client.url(path);
    if (cursor) url.searchParams.set('cursor', cursor);
    const {data} = await client.request<Page<T>>(url.pathname + url.search, {signal});
    items.push(...data.items); cursor = data.nextCursor;
    onProgress?.(items.length);
    if (cursor && seen.has(cursor)) throw new Error(ko.cycle);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

/** InboxModel owns deduplication and E/attempt ordering; UI never advances process cursors. */
export async function readInbox(client: IssusClient, path: string, signal: AbortSignal): Promise<{model: InboxModel; response: InboxResponse}> {
  const model = new InboxModel(), seen = new Set<string>();
  let cursor: string|null = null, response: InboxResponse;
  do {
    const url = client.url(path);
    if (cursor) url.searchParams.set('cursor', cursor);
    response = (await client.request<InboxResponse>(url.pathname + url.search, {signal})).data;
    model.acceptPage(response); cursor = response.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error(ko.cycle);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return {model, response};
}

/** Hydrate canonical comment metadata when the inbox union supplies only content. */
export async function readHistory(client: IssusClient, repo: string, number: number, all: boolean, signal: AbortSignal): Promise<History> {
  const path = `${issuePath(repo, number)}/comments?sinceCompact=${!all}`;
  const first = (await client.request<History>(path, {signal})).data;
  const items = [...first.items], seen = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (seen.has(cursor)) throw new Error(ko.cycle);
    seen.add(cursor);
    const page = (await client.request<History>(`${path}&cursor=${encodeURIComponent(cursor)}`, {signal})).data;
    items.push(...page.items); cursor = page.nextCursor;
  }
  // The canonical/inbox union can retain older unread deliveries; this toggle folds only the issue view.
  const visible = all || !first.compact ? items : items.filter(item => BigInt(item.id) > BigInt(first.compact!.id));
  const ids = [...new Set([...(first.compact ? [first.compact.id] : []), ...visible.map(item => item.id)])];
  const hydrated = new Map<string,CommentView>();
  // Limit concurrent hydration to avoid exhausting the operator's DB pool.
  for (let index = 0; index < ids.length; index += 4) {
    await Promise.all(ids.slice(index, index + 4).map(async id => {
      const {data} = await client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(id)}`, {signal});
      hydrated.set(id, data);
    }));
  }
  return {items: [...new Map(visible.map(item => [item.id, hydrated.get(item.id)!])).values()], compact: first.compact ? hydrated.get(first.compact.id)! : null, nextCursor: null};
}
