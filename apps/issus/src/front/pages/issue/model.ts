import {classify, header, type Classification} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {issuePath, repoPath, type CommentView, type History} from '../../entry/client/index.js';
import {ko} from '../../resources/index.js';
export interface ThreadComment extends CommentView {priority?: Classification}
/** Frozen pagination preserves server priority; OTHER full-text hydration waits for its disclosure. */
export async function readThread(client: IssusClient, repo: string, number: number, all: boolean, signal: AbortSignal): Promise<History> {
  const path = `${issuePath(repo, number)}/comments?sinceCompact=${!all}`;
  const first = (await client.request<History & {items: ThreadComment[]}>(path, {signal})).data;
  const items = [...first.items], seen = new Set<string>(); let cursor = first.nextCursor;
  while (cursor) {if (seen.has(cursor)) throw new Error(ko.cycle); seen.add(cursor); const page = (await client.request<History & {items: ThreadComment[]}>(`${path}&cursor=${encodeURIComponent(cursor)}`, {signal})).data; items.push(...page.items); cursor = page.nextCursor;}
  const visible = items.filter(item => all || !first.compact || BigInt(item.id) > BigInt(first.compact.id));
  const rows = [...new Map([...(first.compact ? [first.compact] : []), ...visible].map(row => [row.id, row as ThreadComment])).values()], hydrated = new Map<string,CommentView>();
  for (let index = 0; index < rows.length; index += 4) await Promise.all(rows.slice(index, index + 4).map(async row => {
    if (row.priority === 'OTHER' && !header(row.body)._noenv && !['HOLD','DECISION'].includes(row.envelope.TYPE)) {hydrated.set(row.id, row); return;}
    const full = (await client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(row.id)}`, {signal})).data;
    hydrated.set(row.id, {...full, ...(row.priority ? {priority: row.priority} : {})});
  }));
  return {compact: first.compact ? hydrated.get(first.compact.id)! : null, items: [...new Map(visible.map(item => [item.id, hydrated.get(item.id)!])).values()], nextCursor: null};
}
/** Deduplicate by immutable decimal id, keeping exact integer ordering beyond Number.MAX_SAFE_INTEGER. */
export function historyComments(history: History): CommentView[] {
  return [...new Map([...(history.compact ? [history.compact] : []), ...history.items].map(comment => [comment.id, comment])).values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
}
/** Use the shared canonical watcher classifier; shared HOLD/DECISION always remain expanded. */
export function commentPriority(comment: CommentView, aliases: string[]): Classification {return (comment as ThreadComment).priority ?? classify(header(comment.body), comment.body, aliases.map(alias => alias.toLowerCase()));}
/** Retain the pinned boundary when a new COMPACT arrives until explicit user application. */
export function pinnedHistory(all: History, boundary: CommentView|null): History {
  return {compact: boundary, nextCursor: null, items: boundary ? historyComments(all).filter(comment => BigInt(comment.id) > BigInt(boundary.id)) : historyComments(all)};
}
