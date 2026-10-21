import {useEffect, useRef, useState} from 'react';
import {subscribe, type IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, type IssueView, type History, type Principal, type CommentView} from '../../entry/client/index.js';
import {browserSocket} from '../../entry/socket/index.js';
import {Envelope} from '../../features/envelope/index.js';
import {Comment} from '../../features/comment/index.js';
import {Composer, type ComposerDraft} from '../../features/composer/index.js';
import {Closing} from '../../features/closing/index.js';
import {Handoff} from '../../features/handoff/index.js';
import {ReferenceLink, issueHref} from '../../features/reference/index.js';
import {historyComments, commentPriority, pinnedHistory, readThread} from './model.js';
import {ko} from '../../resources/index.js';
import {issueKo} from '../../resources/issue.js';
import {composerKo} from '../../resources/composer.js';
import {BoardNote} from './note.js';

export {historyComments, commentPriority, pinnedHistory, readThread} from './model.js';
interface Diagnostics extends IssueView {issue: IssueView['issue'] & {isBoard?: boolean}; pendingLegacy?: {window: string[]; global: string[]}; activeHolds?: string[]; claims?: string[]; ackState?: {directiveId: string; state: string}[]; compact?: {due: boolean; count: number; chars: number}}

/** Since-compact is the default; older records require an explicit expanded view. */
export function Issue({client, repo, number}: {client: IssusClient; repo: string; number: number}) {
  return <IssueContent key={`${repo}:${number}`} client={client} repo={repo} number={number}/>;
}
/** Shared detail surface also renders the registry-discovered board without duplicating its model. */
export function IssueContent({client, repo, number, board = false, heading = true}: {client: IssusClient; repo: string; number: number; board?: boolean; heading?: boolean}) {
  const [all, setAll] = useState(false), [version, setVersion] = useState(0), [view, setView] = useState<Diagnostics|null>(null), [history, setHistory] = useState<History|null>(null), [errors, setErrors] = useState<string[]>([]);
  const [principal, setPrincipal] = useState<Principal|null>(null), [draft, setDraft] = useState<ComposerDraft>(), [priority, setPriority] = useState(false), [newCompact, setNewCompact] = useState(false), [newIds, setNewIds] = useState<string[]>([]), [refreshing, setRefreshing] = useState(false), [stream, setStream] = useState('');
  const boundary = useRef<CommentView|null|undefined>(undefined), previous = useRef<History|null>(null);
  const path = issuePath(repo, number), refresh = () => setVersion(value => value + 1);
  const base = `/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${number}`;
  useEffect(() => {const abort = new AbortController(); void client.request<Principal>('/v1/auth/me', {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) setPrincipal(data);}).catch(() => {}); return () => abort.abort();}, [client]);
  useEffect(() => {const timer = setInterval(refresh, 5000); window.addEventListener('focus', refresh); return () => {clearInterval(timer); window.removeEventListener('focus', refresh);};}, []);
  useEffect(() => {
    const abort = new AbortController(); setRefreshing(true);
    void (async () => {
      const [response, loaded] = await Promise.all([client.request<Diagnostics>(path, {signal: abort.signal}), readThread(client, repo, number, all, abort.signal)]);
      let comments = loaded;
      if (boundary.current === undefined) boundary.current = loaded.compact;
      else if (loaded.compact?.id !== boundary.current?.id) {
        if (!abort.signal.aborted) setNewCompact(true);
        if (!all) comments = pinnedHistory(await readThread(client, repo, number, true, abort.signal), boundary.current);
      }
      if (abort.signal.aborted) return;
      if (previous.current) {const known = new Set(historyComments(previous.current).map(row => row.id)), additions = historyComments(comments).filter(row => !known.has(row.id)).map(row => row.id); if (additions.length) setNewIds(ids => [...new Set([...ids, ...additions])]);}
      previous.current = comments; setView(response.data); setHistory(comments); setErrors([]);
    })().catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}).finally(() => {if (!abort.signal.aborted) setRefreshing(false);});
    return () => abort.abort();
  }, [client, path, repo, number, all, version]);
  useEffect(() => {
    if (!principal?.alias) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>|undefined; setStream(ko.streamConnecting);
    void subscribe(client, {transport: 'ws', socket: browserSocket, signal: abort.signal, request: {channels: [], repo, issues: [number], from: 'since-compact'}, key: () => crypto.randomUUID(), maxReconnects: 4,
      save: checkpoint => {if (checkpoint.closed && !abort.signal.aborted) setStream(ko.streamRetry);},
      onSubscription: () => refresh(), onFrame: frame => {if (frame.type === 'subscribed') setStream(ko.streamConnected); if (frame.type === 'event') {clearTimeout(timer); timer = setTimeout(refresh, 150);} if (frame.type === 'error') setStream(ko.streamRetry);},
    }).catch(() => {if (!abort.signal.aborted) setStream(ko.streamFailed);});
    return () => {abort.abort(); clearTimeout(timer);};
  }, [client, principal?.alias, repo, number]);
  const comments = history ? historyComments(history) : [], actualBoard = board || !!view?.issue.isBoard, aliases = principal?.alias ? [principal.alias] : [];
  const priorities = new Map(comments.map(comment => [comment.id, commentPriority(comment, aliases)])), pendingIds = [...new Set([...(view?.activeHolds ?? []), ...(view?.pendingLegacy?.global ?? []), ...comments.filter(comment => ['HOLD','DECISION'].includes(comment.envelope.TYPE)).map(comment => comment.id)])];
  const ordered = priority ? ['ME','CC','ALL','OTHER'].map(group => ({group, comments: comments.filter(comment => priorities.get(comment.id) === group)})) : [{group: '', comments}];
  const canManage = principal?.kind === 'bootstrap' || !!principal?.alias && principal.alias.toLowerCase() === view?.envelope.OWNER?.toLowerCase();
  function renderComment(comment: CommentView) {return <Comment key={comment.id} comment={comment} client={client} repo={repo} path={path} principal={principal} seen={comments.at(-1)?.id ?? ''} onDraft={setDraft} onPosted={refresh} priority={priorities.get(comment.id)} board={actualBoard} readonly={!view?.issue.isOpen}/>;}
  return <>{heading && <h1>{view ? ko.issueTitle(number, view.issue.title) : ko.issues}</h1>}
    {errors.length > 0 && <div role="alert">{errors.join('\n')}</div>}
    {stream && <p role={stream === ko.streamFailed ? 'alert' : 'status'} aria-label={ko.streamStatus}>{stream}</p>}
    {view && <section aria-label={ko.current}><Envelope fields={view.envelope} client={client} repo={repo}/><p>{view.issue.isOpen ? ko.open : ko.closed}</p><pre>{view.body}</pre></section>}
    {view && <><a href={`${base}/edit`}>{issueKo.edit}</a> <a href={`${base}/compact`}>{composerKo.compactLink}</a></>}
    <section aria-label={issueKo.priorityNotice}>{pendingIds.length > 0 && <div role="alert"><ul>{pendingIds.map(id => <li key={id}><ReferenceLink client={client} repo={repo} id={id}/></li>)}</ul></div>}</section>
    {newCompact && <p role="status">{issueKo.newCompact} <button type="button" onClick={() => {boundary.current = undefined; setNewCompact(false); refresh();}}>{issueKo.applyCompact}</button></p>}
    {newIds.length > 0 && <p role="status">{issueKo.newComments(newIds.length)} <a href={`#comment-${newIds[0]}`} onClick={() => {document.getElementById(`comment-${newIds[0]}`)?.focus(); setNewIds([]);}}>{issueKo.goNew}</a></p>}
    <button type="button" aria-expanded={all} aria-controls="issue-comments" onClick={() => {setHistory(null); setAll(value => !value);}}>{all ? ko.since : ko.all}</button>
    <label htmlFor="issue-comment-order">{issueKo.order}</label><select id="issue-comment-order" value={priority ? 'priority' : 'chronology'} onChange={event => setPriority(event.target.value === 'priority')}><option value="chronology">{issueKo.chronology}</option><option value="priority">{issueKo.priority}</option></select>
    {history === null && errors.length === 0 && <p role="status" aria-busy="true">{ko.loading}</p>}
    {history && refreshing && <p role="status">{issueKo.refreshing}</p>}
    {history && comments.length === 0 && <p role="status">{ko.empty}</p>}
    {priority ? <div id="issue-comments">{ordered.map(({group, comments}) => <section key={group} aria-label={group}><h2>{group} ({comments.length})</h2><ol aria-label={`${ko.comments} ${group}`}>{comments.map(renderComment)}</ol></section>)}</div> : <ol id="issue-comments" aria-label={ko.comments}>{comments.map(renderComment)}</ol>}
    {view?.issue.isOpen ? <>{actualBoard && principal && <BoardNote principal={principal} onDraft={setDraft}/>}<Composer client={client} path={path} onPosted={refresh} principal={principal} revision={view.revision} board={actualBoard} compactHref={`${base}/compact`} draft={draft}/>
      {!actualBoard && <Handoff client={client} repo={repo} number={number} principal={principal} owner={view.envelope.OWNER ?? ''} revision={view.revision} onChanged={refresh}/>}</> : view && <p role="status">{issueKo.closedHint} {issueHref(repo, view.envelope['REPLY-IN']) && <a href={issueHref(repo, view.envelope['REPLY-IN'])}>{issueKo.followup}</a>}</p>}
    {view && canManage && <Closing client={client} path={path} revision={view.revision} repo={repo} isOpen={view.issue.isOpen} replyIn={view.envelope['REPLY-IN']} diagnostics={{STATE: view.envelope.STATE, COMPACT: view.envelope.COMPACT, pendingLegacy: view.pendingLegacy, activeHolds: view.activeHolds, claims: view.claims, ackState: view.ackState}} onClosed={refresh}/>}
  </>;
}
