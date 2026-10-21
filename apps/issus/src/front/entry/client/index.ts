import {IssusClient, ClientError, OperationTimeout, issuePath, repoPath, InboxModel} from 'issus_domain/front';
import type {InboxResponse} from 'issus_domain/common';
import {ko} from '../../resources/index.js';

export {issuePath, repoPath, ClientError, OperationTimeout, InboxModel};
export interface Principal {alias?: string; sid?: string; kind?: string}
export interface CommentView {id: string; body: string; envelope: Record<string,string>; createdAt?: string; validity?: string}
export interface IssueView {issue: {number: number; title: string; isOpen: boolean; state: string}; body: string; envelope: Record<string,string>; revision: number}
export interface History {items: CommentView[]; compact: CommentView|null; nextCursor: string|null}
export interface Page<T> {items: T[]; nextCursor: string|null}
export interface RepoView {id: string; owner: string; slug: string}
export interface IssueSummary {number: number; title: string; state: string; isOpen: boolean}
const csrfKey = 'issus.csrf';

/** Cookie authentication is same-origin; bearer is held only for the initial exchange. */
export function createBrowserClient(token?: string): IssusClient {
  return new IssusClient({server: window.location.origin, token, fetch: (url, init = {}) => {
    const headers = new Headers(init.headers);
    const csrf = sessionStorage.getItem(csrfKey);
    if (csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET')) headers.set('X-CSRF-Token', csrf);
    return fetch(url, {...init, headers, credentials: 'same-origin'});
  }});
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

/** Consume immutable pages without inferring processed progress from what was displayed. */
export async function allPages<T>(client: IssusClient, path: string, signal: AbortSignal): Promise<T[]> {
  const items: T[] = [], seen = new Set<string>();
  let cursor: string|null = null;
  do {
    const url = client.url(path);
    if (cursor) url.searchParams.set('cursor', cursor);
    const {data} = await client.request<Page<T>>(url.pathname + url.search, {signal});
    items.push(...data.items); cursor = data.nextCursor;
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
