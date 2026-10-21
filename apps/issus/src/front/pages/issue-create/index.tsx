import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, type Principal} from '../../entry/client/index.js';
import {IssueForm} from '../../features/issue-form/index.js';
import {issueKo} from '../../resources/issue.js';
import {ko} from '../../resources/index.js';
/** New issue syntax inspection cannot claim context validation before an issue exists. */
export function IssueCreate({client, repo}: {client: IssusClient; repo: string; number?: number}) {
  const [principal, setPrincipal] = useState<Principal|null>(null), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {const abort = new AbortController(); void client.request<Principal>('/v1/auth/me', {signal: abort.signal}).then(({data}) => setPrincipal(data)).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}); return () => abort.abort();}, [client]);
  return <><h1>{issueKo.create}</h1>{errors.length > 0 ? <div role="alert">{errors.join('\n')}</div> : principal ? <IssueForm client={client} repo={repo} principal={principal}/> : <p role="status" aria-busy="true">{ko.loading}</p>}</>;
}
