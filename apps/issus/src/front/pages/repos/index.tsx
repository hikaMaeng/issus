import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, errorLines, type RepoView} from '../../entry/client/index.js';
import {ko} from '../../resources/index.js';

/** Repository list is bounded by the authenticated alias's grants. */
export function Repos({client}: {client: IssusClient}) {
  const [items, setItems] = useState<RepoView[]|null>(null), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {const abort = new AbortController(); void allPages<RepoView>(client, '/v1/repos', abort.signal).then(setItems).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}); return () => abort.abort();}, [client]);
  return <><h1>{ko.repos}</h1>{errors.length > 0 ? <div role="alert">{errors.join('\n')}</div> : items === null ? <p role="status" aria-busy="true">{ko.loading}</p> : items.length === 0 ? <p role="status">{ko.empty}</p> :
    <ul aria-label={ko.repos}>{items.map(repo => <li key={repo.id}><a href={`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.slug)}/issues`}>{repo.owner}/{repo.slug}</a></li>)}</ul>}</>;
}
