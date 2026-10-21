import {useEffect, useRef, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, createBrowserClient, errorLines, ClientError, type RepoView} from '../../entry/client/index.js';
import {ko, feedbackKo, sessionKo} from '../../resources/index.js';
import {Feedback} from '../../features/feedback/index.js';

/** Repository list is bounded by the authenticated alias's grants. */
export function Repos({client}: {client: IssusClient}) {
  const [items, setItems] = useState<RepoView[]|null>(null), [errors, setErrors] = useState<string[]>([]), [version, setVersion] = useState(0);
  useEffect(() => {const abort = new AbortController(); setErrors([]); void allPages<RepoView>(client, '/v1/repos', abort.signal).then(data => {if (!abort.signal.aborted) setItems(data);}).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));}); return () => abort.abort();}, [client, version]);
  return <><h1>{ko.repos}</h1><Feedback errors={errors} loading={!errors.length && items === null} empty={items?.length === 0}/>{errors.length > 0 && <button onClick={() => setVersion(value => value + 1)}>{feedbackKo.retry}</button>}
    {items && !errors.length && <><p role="status">{feedbackKo.complete(items.length)}</p><ul aria-label={ko.repos}>{items.map(repo => {
      const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.slug)}`;
      return <li key={repo.id}><a href={`${path}/issues`}>{repo.owner}/{repo.slug}</a> · <a href={`${path}/board`}>{feedbackKo.board}</a></li>;
    })}</ul></>}<RepoCreateForm onCreated={() => setVersion(value => value + 1)}/></>;
}

/** Bootstrap input remains in this explicit form and never changes the current identity. */
function RepoCreateForm({onCreated}: {onCreated: () => void}) {
  const [open, setOpen] = useState(false), [secret, setSecret] = useState(''), [owner, setOwner] = useState(''), [slug, setSlug] = useState(''), [projectCode, setProjectCode] = useState(''), [autoBoard, setAutoBoard] = useState(true), [boardOwner, setBoardOwner] = useState('');
  const [errors, setErrors] = useState<string[]>([]), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<{key: string; body: Record<string,unknown>}|null>(null);
  async function create() {
    setBusy(true); setErrors([]);
    pending.current ??= {key: crypto.randomUUID(), body: {owner, slug, projectCode, autoBoard, ...(autoBoard && boardOwner ? {boardOwner} : {})}};
    try {await createBrowserClient(secret).write('/v1/repos', {method: 'POST', ...pending.current, onAccepted: operation => setStatus(ko.operationPending(operation.operationId))}); setSecret(''); setStatus(feedbackKo.repoCreated); pending.current = null; onCreated();}
    catch (error) {setErrors(errorLines(error)); if (error instanceof ClientError && error.status >= 400) pending.current = null;}
    finally {setBusy(false);}
  }
  return <details open={open} onToggle={event => {setOpen(event.currentTarget.open); if (!event.currentTarget.open) setSecret('');}}><summary>{feedbackKo.repoCreate}</summary>{open && <form aria-label={feedbackKo.repoCreate} aria-busy={busy} onSubmit={event => {event.preventDefault(); void create();}}>
    <label htmlFor="repo-secret">{sessionKo.managementToken}</label><input id="repo-secret" type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} required disabled={busy}/>
    <fieldset disabled={busy || !!pending.current}>
      <label htmlFor="repo-owner">{sessionKo.owner}</label><input id="repo-owner" value={owner} onChange={event => setOwner(event.target.value)} required/>
      <label htmlFor="repo-slug">{feedbackKo.slug}</label><input id="repo-slug" value={slug} onChange={event => setSlug(event.target.value)} required/>
      <label htmlFor="repo-code">{feedbackKo.projectCode}</label><input id="repo-code" value={projectCode} onChange={event => setProjectCode(event.target.value)} required/>
      <label><input type="checkbox" checked={autoBoard} onChange={event => setAutoBoard(event.target.checked)}/>{feedbackKo.autoBoard}</label>
      {autoBoard && <><label htmlFor="repo-board-owner">{feedbackKo.boardOwner}</label><input id="repo-board-owner" value={boardOwner} onChange={event => setBoardOwner(event.target.value)} required/></>}
    </fieldset><button disabled={busy} type="submit">{pending.current ? sessionKo.retry : feedbackKo.create}</button><Feedback errors={errors} status={status}/>
  </form>}</details>;
}
