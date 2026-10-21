import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, type IssueView} from '../../entry/client/index.js';
import {IssueForm} from '../../features/issue-form/index.js';
import {issueKo} from '../../resources/issue.js';
import {ko} from '../../resources/index.js';
/** Capture one edit baseline. Later writes use If-Match and an explicit conflict/merge path. */
export function IssueEdit({client, repo, number}: {client: IssusClient; repo: string; number: number}) {
  const [view, setView] = useState<IssueView|null>(null), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {const abort = new AbortController(); void client.request<IssueView>(issuePath(repo, number), {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) setView(data);}).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}); return () => abort.abort();}, [client, repo, number]);
  return <><h1>{issueKo.edit}</h1>{errors.length > 0 ? <div role="alert">{errors.join('\n')}</div> : view ? <IssueForm client={client} repo={repo} initial={view}/> : <p role="status" aria-busy="true">{ko.loading}</p>}</>;
}
