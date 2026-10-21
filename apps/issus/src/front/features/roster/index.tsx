import {useEffect, useRef, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, ClientError, createBrowserClient, errorLines, hasBrowserCsrf} from '../../entry/client/index.js';
import {ko, rosterKo, feedbackKo, sessionKo} from '../../resources/index.js';
import {Feedback} from '../feedback/index.js';

export interface RosterRow {alias: string; role?: string; model?: string; scope?: string; sid?: string}
export interface AliasRegistryItem {id: string; name: string; role: string; model: string; scope: string; sid: string|null; repos: string[]; registeredAt: string; renamedFrom: string[]; status: 'active'|'renamed'; renamedTo: string|null}
interface AliasDetail {alias: AliasRegistryItem; recentIssues: {owner: string; repo: string; number: number; title: string}[]; openClaimCount: number}
/** Extract only an explicit ROSTER block; body text never becomes registry authority. */
export function parseRoster(body: string): RosterRow[] {
  const lines = body.split(/\r?\n/), rows: RosterRow[] = [];
  let active = false;
  for (const line of lines) {
    const start = /^ROSTER:\s*(.*)$/.exec(line);
    if (start) active = true;
    else if (active && /^[A-Z][A-Z-]*:/.test(line)) break;
    if (!active) continue;
    for (const candidate of (start ? start[1] : line).split(/\s+·\s+/)) {
      const cells = candidate.trim().replace(/^\||\|$/g, '').split('|').map(value => value.trim());
      if (cells.length !== 5 || /^(alias|별칭|[-: ]+)$/i.test(cells[0]) || !cells[0]) continue;
      const [alias, role, model, scope, sid] = cells;
      rows.push({alias, role, model, scope, sid});
    }
  }
  return rows;
}

/** A visible source separates body observations, principal, and registry facts. */
export function RosterTable({rows, source, registry = false}: {rows: readonly RosterRow[]; source: string; registry?: boolean}) {
  return <section aria-label={source}><h2>{source}</h2><p>{feedbackKo.source}: {source}</p>{rows.length ? <div className="table-scroll"><table aria-label={registry ? rosterKo.registry : rosterKo.roster}><thead><tr>{[ko.alias, rosterKo.role, rosterKo.model, rosterKo.scope, sessionKo.sid].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.alias}/${row.sid}/${index}`} data-testid="alias-row" data-alias={row.alias}><th scope="row">{row.alias}</th><td>{row.role ?? feedbackKo.absent}</td><td>{row.model ?? feedbackKo.absent}</td><td>{row.scope ?? feedbackKo.absent}</td><td>{row.sid ?? feedbackKo.absent}</td></tr>)}</tbody></table></div> : <Feedback empty/>}</section>;
}

/** Q1 registry reads are authoritative only for the explicitly labelled source. */
export function AliasRegistry({client, owner}: {client: IssusClient; owner: string}) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [version, setVersion] = useState(0), [items, setItems] = useState<AliasRegistryItem[]|null>(null), [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState(''), [detail, setDetail] = useState<AliasDetail|null>(null), [detailErrors, setDetailErrors] = useState<string[]>([]);
  const path = `/v1/owners/${encodeURIComponent(owner)}/aliases`;
  useEffect(() => {
    const abort = new AbortController(); setItems(null); setErrors([]);
    void allPages<AliasRegistryItem>(client, `${path}?q=${encodeURIComponent(search)}`, abort.signal).then(data => {if (!abort.signal.aborted) setItems(data);}).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));});
    return () => abort.abort();
  }, [client, path, search, version]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController(); setDetail(null); setDetailErrors([]);
    void client.request<AliasDetail>(`${path}/${encodeURIComponent(selected)}`, {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) setDetail(data);}).catch(error => {if (!abort.signal.aborted) setDetailErrors(errorLines(error));});
    return () => abort.abort();
  }, [client, path, selected, version]);
  return <section aria-label={rosterKo.registry}><h2>{rosterKo.registry}</h2><p>{feedbackKo.source}: {rosterKo.registrySource}</p>
    <form aria-label={rosterKo.registrySearch} onSubmit={event => {event.preventDefault(); setSearch(query); setVersion(value => value + 1);}}><label htmlFor="registry-search">{rosterKo.registrySearch}</label><input id="registry-search" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)}/><button type="submit">{ko.refresh}</button></form>
    <Feedback errors={errors} loading={!errors.length && items === null} empty={items?.length === 0}/>
    {items && !errors.length && <><p role="status">{feedbackKo.complete(items.length)}</p><div className="table-scroll"><table aria-label={rosterKo.registry}><thead><tr>{[ko.alias, rosterKo.role, rosterKo.model, rosterKo.scope, sessionKo.sid, rosterKo.status].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.name} data-testid="alias-row" data-alias={item.name}><th scope="row"><button type="button" aria-label={rosterKo.detailName(item.name)} onClick={() => setSelected(item.name)}>{item.name}</button></th><td>{item.role}</td><td>{item.model}</td><td>{item.scope}</td><td>{item.sid ?? feedbackKo.absent}</td><td>{item.status}{item.renamedTo && ` → ${item.renamedTo}`}</td></tr>)}</tbody></table></div></>}
    {selected && <section aria-label={rosterKo.aliasDetail}><h3>{rosterKo.detailName(selected)}</h3><Feedback errors={detailErrors} loading={!detail && !detailErrors.length}/>{detail && <>
      <dl><div><dt>{rosterKo.aliasId}</dt><dd>{detail.alias.id}</dd></div><div><dt>{rosterKo.registeredAt}</dt><dd>{detail.alias.registeredAt}</dd></div><div><dt>{rosterKo.renamedFrom}</dt><dd>{detail.alias.renamedFrom.join(', ') || feedbackKo.absent}</dd></div><div><dt>{rosterKo.repos}</dt><dd>{detail.alias.repos.join(', ') || feedbackKo.absent}</dd></div><div><dt>{rosterKo.openClaims}</dt><dd>{detail.openClaimCount}</dd></div></dl>
      <p>{rosterKo.tombstone}</p><h3>{rosterKo.recentIssues}</h3>{detail.recentIssues.length ? <ul>{detail.recentIssues.map(item => <li key={`${item.owner}/${item.repo}/${item.number}`}><a href={`/repos/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/issues/${item.number}`}>{ko.issueTitle(item.number, item.title)}</a></li>)}</ul> : <Feedback empty/>}
    </>}</section>}
  </section>;
}

interface CheckResult {available: boolean; collisions: {kind: string; alias: string; evidence?: unknown}[]}
/** Conflict inspection is not a reservation or authorization for session issuance. */
export function AliasCheck({client, owner}: {client: IssusClient; owner: string}) {
  const [name, setName] = useState(''), [deep, setDeep] = useState(true), [result, setResult] = useState<CheckResult|null>(null), [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false);
  return <form aria-label={rosterKo.check} aria-busy={busy} onSubmit={event => {
    event.preventDefault(); setErrors([]); setResult(null);
    if (!hasBrowserCsrf()) {setErrors([ko.csrfMissing]); return;}
    setBusy(true); void client.request<CheckResult>(`/v1/owners/${encodeURIComponent(owner)}/aliases/check`, {method: 'POST', body: {name, deep}}).then(({data}) => setResult(data)).catch(error => setErrors(errorLines(error))).finally(() => setBusy(false));
  }}>
    <h2>{rosterKo.check}</h2><p>{sessionKo.owner}: {owner}</p><label htmlFor="check-name">{ko.alias}</label><input id="check-name" value={name} onChange={event => setName(event.target.value)} required/>
    <label><input type="checkbox" checked={deep} onChange={event => setDeep(event.target.checked)}/>{rosterKo.deep}</label><button disabled={busy} type="submit">{rosterKo.executeCheck}</button><Feedback errors={errors}/>
    {result && <section aria-label={rosterKo.checkSource}><p role="status">{result.available ? rosterKo.available : rosterKo.collision}</p><ul>{result.collisions.map((item, index) => <li key={index}>{rosterKo.kind}: {item.kind} · {ko.alias}: {item.alias} · {rosterKo.evidence}: {typeof item.evidence === 'string' ? item.evidence : JSON.stringify(item.evidence)}</li>)}</ul></section>}
  </form>;
}

/** Registration and rename explicitly use the selected credential and retain unknown outcomes. */
export function AliasAdministration({client, owner, repoId, issueNumber}: {client: IssusClient; owner: string; repoId?: string; issueNumber?: number}) {
  const [secret, setSecret] = useState(''), [name, setName] = useState(''), [role, setRole] = useState(''), [model, setModel] = useState(''), [scope, setScope] = useState(''), [repos, setRepos] = useState(repoId ?? ''), [announcement, setAnnouncement] = useState('');
  const [aliasId, setAliasId] = useState(''), [newName, setNewName] = useState(''), [errors, setErrors] = useState<string[]>([]), [result, setResult] = useState<unknown>(null), [busy, setBusy] = useState(false), [kind, setKind] = useState<'register'|'rename'>('register');
  const pending = useRef<{path: string; key: string; body: Record<string,unknown>}|null>(null);
  async function submit() {
    if (kind === 'rename' && !secret && !hasBrowserCsrf()) {setErrors([ko.csrfMissing]); return;}
    const announcementIssue = repoId && issueNumber ? {repoId, issueNumber} : undefined;
    pending.current ??= {path: kind === 'register' ? `/v1/owners/${encodeURIComponent(owner)}/aliases` : `/v1/aliases/${encodeURIComponent(aliasId)}/rename`, key: crypto.randomUUID(), body: kind === 'register' ? {name, role, model, scope, repos: repos.split(',').map(value => value.trim()).filter(Boolean), announcementBody: announcement, ...(announcementIssue ? {announcementIssue} : {})} : {newName, announcementBody: announcement, ...(announcementIssue ? {announcementIssue} : {})}};
    setBusy(true); setErrors([]); setResult(null);
    try {const request = pending.current; setResult(await (secret ? createBrowserClient(secret) : client).write(request.path, {method: 'POST', key: request.key, body: request.body})); setSecret(''); pending.current = null;}
    catch (error) {setErrors(errorLines(error)); if (error instanceof ClientError && error.status >= 400) pending.current = null;}
    finally {setBusy(false);}
  }
  return <details onToggle={event => {if (!event.currentTarget.open) setSecret('');}}><summary>{rosterKo.register} / {rosterKo.rename}</summary><form aria-label={kind === 'register' ? rosterKo.register : rosterKo.rename} aria-busy={busy} onSubmit={event => {event.preventDefault(); void submit();}}>
    <button type="button" disabled={busy || !!pending.current} onClick={() => {setKind(kind === 'register' ? 'rename' : 'register'); setResult(null); setErrors([]); setSecret('');}}>{kind === 'register' ? rosterKo.rename : rosterKo.register}</button>
    <label htmlFor="alias-secret">{sessionKo.managementToken}</label><input id="alias-secret" type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} required={kind === 'register'} disabled={busy}/>
    <fieldset disabled={busy || !!pending.current}>{kind === 'register' ? <>
      {[[ko.alias, name, setName, 'alias-name'], [rosterKo.role, role, setRole, 'alias-role'], [rosterKo.model, model, setModel, 'alias-model'], [rosterKo.scope, scope, setScope, 'alias-scope'], [rosterKo.repos, repos, setRepos, 'alias-repos']].map(([label,value,setter,id]) => <div key={String(id)}><label htmlFor={String(id)}>{String(label)}</label><input id={String(id)} value={String(value)} onChange={event => (setter as (value: string) => void)(event.target.value)} required/></div>)}
    </> : <><label htmlFor="alias-id">{rosterKo.aliasId}</label><input id="alias-id" value={aliasId} onChange={event => setAliasId(event.target.value)} required/><label htmlFor="alias-new">{rosterKo.newName}</label><input id="alias-new" value={newName} onChange={event => setNewName(event.target.value)} required/><p>{rosterKo.tombstone}</p></>}
      <label htmlFor="alias-announcement">{rosterKo.announcement}</label><textarea id="alias-announcement" value={announcement} onChange={event => setAnnouncement(event.target.value)} required/>
    </fieldset><button disabled={busy} type="submit">{pending.current ? sessionKo.retry : kind === 'register' ? rosterKo.executeRegister : rosterKo.executeRename}</button><Feedback errors={errors}/>
    {result !== null && <section aria-label={kind === 'register' ? rosterKo.registeredSource : rosterKo.renamedSource}><p role="status">{kind === 'register' ? rosterKo.registered : rosterKo.renamed}</p><pre>{JSON.stringify(result, null, 2)}</pre></section>}
  </form></details>;
}
