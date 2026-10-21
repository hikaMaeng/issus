import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, repoPath, type IssueView, type Principal, type RepoView} from '../../entry/client/index.js';
import {AliasAdministration, AliasCheck, AliasRegistry, parseRoster, RosterTable} from '../../features/roster/index.js';
import {Feedback} from '../../features/feedback/index.js';
import {ko, rosterKo, feedbackKo} from '../../resources/index.js';

/** Body roster, current identity, and mutation responses retain separate provenance. */
export function Roster({client, principal, owner}: {client: IssusClient; principal: Principal; owner: string}) {
  const params = new URLSearchParams(location.search), repo = params.get('repo') ?? '';
  const [number, setNumber] = useState(params.get('issue') ?? ''), [selected, setSelected] = useState(params.get('issue') ?? ''), [issue, setIssue] = useState<IssueView|null>(null), [repoId, setRepoId] = useState<string>(), [loading, setLoading] = useState(false), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const abort = new AbortController(); setIssue(null); setRepoId(undefined); setErrors([]);
    if (!repo) return;
    setLoading(true);
    void (async () => {
      const {data} = await client.request<RepoView>(repoPath(repo), {signal: abort.signal}); if (!abort.signal.aborted) setRepoId(data.id);
      if (/^[1-9]\d*$/.test(selected)) {const {data} = await client.request<IssueView>(issuePath(repo, Number(selected)), {signal: abort.signal}); if (!abort.signal.aborted) setIssue(data);}
    })().catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}).finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [client, repo, selected]);
  return <><h1>{rosterKo.roster}</h1><p>{feedbackKo.claimHint}</p><AliasRegistry client={client} owner={owner}/>
    <form aria-label={rosterKo.roster} onSubmit={event => {event.preventDefault(); setSelected(number); const query = new URLSearchParams(location.search); query.set('issue', number); history.replaceState(null, '', `${location.pathname}?${query}`);}}>
      <p>{repo || feedbackKo.selectRepo}</p><label htmlFor="roster-issue">{rosterKo.issue}</label><input id="roster-issue" type="number" min="1" value={number} onChange={event => setNumber(event.target.value)} required disabled={!repo}/><button disabled={!repo} type="submit">{ko.applyFilter}</button>
    </form><Feedback errors={errors} loading={loading}/>
    <RosterTable source={rosterKo.principalSource} rows={principal.alias ? [{alias: principal.alias, sid: principal.sid}] : []}/>
    {issue ? <><RosterTable source={rosterKo.bodySource(issue.revision)} rows={parseRoster(issue.body)}/><details><summary>{ko.raw}</summary><pre>{issue.body}</pre></details></> : !loading && <p>{rosterKo.noIssue}</p>}
    <AliasCheck client={client} owner={owner}/><AliasAdministration client={client} owner={owner} repoId={repoId} issueNumber={/^[1-9]\d*$/.test(selected) ? Number(selected) : undefined}/>
  </>;
}
