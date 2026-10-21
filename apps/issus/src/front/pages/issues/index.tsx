import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, errorLines, type IssueSummary} from '../../entry/client/index.js';
import {ko, feedbackKo} from '../../resources/index.js';
import {IssueFilterForm, readFilters, filterIssues, filterSearch, issueListPath, type IssueFilters} from '../../features/issue-filters/index.js';
import {Feedback} from '../../features/feedback/index.js';

/** Issue rows expose stable identities and links within their semantic table. */
export function Issues({client, repo}: {client: IssusClient; repo: string}) {
  const [filters, setFilters] = useState(() => readFilters(location.search)), [version, setVersion] = useState(0), [items, setItems] = useState<IssueSummary[]|null>(null), [errors, setErrors] = useState<string[]>([]), [refreshing, setRefreshing] = useState(false);
  const [collected, setCollected] = useState(0);
  useEffect(() => {const pop = () => setFilters(readFilters(location.search)); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);}, []);
  function change(next: IssueFilters) {setFilters(next); history.replaceState(null, '', `${location.pathname}?${filterSearch(location.search, next)}`);}
  const path = issueListPath(repo, filters);
  useEffect(() => {
    const abort = new AbortController(); setItems(null); setErrors([]); setCollected(0);
    let active = false, loaded = false;
    async function load() {if (active) return; active = true; if (loaded) setRefreshing(true); try {const data = await allPages<IssueSummary>(client, path, abort.signal, count => {if (!abort.signal.aborted) setCollected(count);}); if (!abort.signal.aborted) {setItems([...new Map(data.map(item => [item.number,item])).values()]); setErrors([]); loaded = true;}} catch (error) {if (!abort.signal.aborted) setErrors(errorLines(error));} finally {active = false; if (!abort.signal.aborted) setRefreshing(false);}}
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => {abort.abort(); clearInterval(timer);};
  }, [client, path, version]);
  const visible = items ? filterIssues(items, filters) : [];
  return <><h1>{ko.issues}</h1><p>{repo}</p><a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/new`}>{feedbackKo.newIssue}</a>
    <IssueFilterForm filters={filters} onChange={change} onRefresh={() => setVersion(value => value + 1)}/>
    {refreshing && <p role="status">{feedbackKo.refreshPending}</p>}
    <Feedback errors={errors} loading={!errors.length && items === null} empty={items !== null && visible.length === 0}/>
    {items === null && !errors.length && <p role="status">{feedbackKo.collecting(collected)}</p>}
    {items !== null && !errors.length && <><p role="status">{feedbackKo.complete(items.length)} · {feedbackKo.matches(visible.length)}</p>{visible.length > 0 && <div className="table-scroll"><table aria-label={ko.issues}><thead><tr><th scope="col">{ko.title}</th><th scope="col">{feedbackKo.workState}</th><th scope="col">{ko.owner}</th><th scope="col">{ko.state}</th><th scope="col">{feedbackKo.pointers}</th></tr></thead><tbody>{visible.map(issue => <tr key={issue.number} data-testid="issue-row" data-issue-number={issue.number}><th scope="row"><a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${issue.number}`}>{ko.issueTitle(issue.number, issue.title)}</a></th><td>{issue.state}</td><td>{issue.ownerAlias ?? issue.owner ?? issue.ownerAliasId ?? feedbackKo.checkingOwner}</td><td>{issue.isOpen ? ko.open : ko.closed}</td><td>{issue.compact ?? issue.compactId ?? feedbackKo.absent} / {issue.isBoard ? feedbackKo.board : feedbackKo.absent}</td></tr>)}</tbody></table></div>}</>}
  </>;
}
