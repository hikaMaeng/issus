import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, readHistory, type IssueView, type History} from '../../entry/client/index.js';
import {Envelope} from '../../features/envelope/index.js';
import {Comment} from '../../features/comment/index.js';
import {Composer} from '../../features/composer/index.js';
import {Closing} from '../../features/closing/index.js';
import {ko} from '../../resources/index.js';

/** Since-compact is the default; older records require an explicit expanded view. */
export function Issue({client, repo, number}: {client: IssusClient; repo: string; number: number}) {
  const [all, setAll] = useState(false), [version, setVersion] = useState(0), [view, setView] = useState<IssueView|null>(null), [history, setHistory] = useState<History|null>(null), [errors, setErrors] = useState<string[]>([]);
  const path = issuePath(repo, number), refresh = () => setVersion(value => value + 1);
  useEffect(() => {
    const abort = new AbortController(); setErrors([]); setHistory(null);
    void Promise.all([client.request<IssueView>(path, {signal: abort.signal}), readHistory(client, repo, number, all, abort.signal)]).then(([response, comments]) => {if (!abort.signal.aborted) {setView(response.data); setHistory(comments);}}).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));});
    return () => abort.abort();
  }, [client, path, repo, number, all, version]);
  const comments = history ? [...new Map([...(history.compact ? [history.compact] : []), ...history.items].map(item => [item.id, item])).values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0) : [];
  return <><h1>{view ? ko.issueTitle(number, view.issue.title) : ko.issues}</h1>
    {errors.length > 0 && <div role="alert">{errors.join('\n')}</div>}
    {view && <section aria-label={ko.current}><Envelope fields={view.envelope}/><p>{view.issue.isOpen ? ko.open : ko.closed}</p><pre>{view.body}</pre></section>}
    <button type="button" aria-expanded={all} aria-controls="issue-comments" onClick={() => setAll(value => !value)}>{all ? ko.since : ko.all}</button>
    {history === null && errors.length === 0 && <p role="status" aria-busy="true">{ko.loading}</p>}
    {history && comments.length === 0 && <p role="status">{ko.empty}</p>}
    <ol id="issue-comments" aria-label={ko.comments}>{comments.map(comment => <Comment key={comment.id} comment={comment}/>)}</ol>
    {view?.issue.isOpen && <><Composer client={client} path={path} onPosted={refresh}/><Closing client={client} path={path} revision={view.revision} onClosed={refresh}/></>}
  </>;
}
