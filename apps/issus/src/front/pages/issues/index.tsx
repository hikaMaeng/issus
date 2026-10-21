import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, errorLines, repoPath, type IssueSummary} from '../../entry/client/index.js';
import {ko} from '../../resources/index.js';

/** Issue rows expose stable identities and links within their semantic table. */
export function Issues({client, repo}: {client: IssusClient; repo: string}) {
  const [filter, setFilter] = useState('open'), [items, setItems] = useState<IssueSummary[]|null>(null), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const abort = new AbortController(); setItems(null); setErrors([]);
    void allPages<IssueSummary>(client, `${repoPath(repo)}/issues?state=${filter}`, abort.signal).then(setItems).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}); return () => abort.abort();
  }, [client, repo, filter]);
  return <><h1>{ko.issues}</h1><p>{repo}</p><label htmlFor="issue-filter">{ko.filter}</label><select id="issue-filter" value={filter} onChange={event => setFilter(event.target.value)}>{Object.entries(ko.statusFilter).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
    {errors.length > 0 ? <div role="alert">{errors.join('\n')}</div> : items === null ? <p role="status" aria-busy="true">{ko.loading}</p> : items.length === 0 ? <p role="status">{ko.empty}</p> :
      <table aria-label={ko.issues}><thead><tr><th scope="col">{ko.title}</th><th scope="col">{ko.state}</th></tr></thead><tbody>{items.map(issue => <tr key={issue.number} data-testid="issue-row" data-issue-number={issue.number}><th scope="row"><a href={`/repos/${repo}/issues/${issue.number}`}>{ko.issueTitle(issue.number, issue.title)}</a></th><td>{issue.state} · {issue.isOpen ? ko.open : ko.closed}</td></tr>)}</tbody></table>}</>;
}
