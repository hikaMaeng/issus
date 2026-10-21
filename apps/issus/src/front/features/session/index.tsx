import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, ClientError, connectBrowser, createBrowserClient, errorLines, clearBrowserSession, type Principal} from '../../entry/client/index.js';
import {ko, sessionKo, rosterKo} from '../../resources/index.js';
import {Feedback} from '../feedback/index.js';

/** Reject external and credential-bearing return destinations. */
export function safeReturnPath(value: string|null|undefined, origin: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/repos';
  try {const url = new URL(value, origin); return url.origin === origin && !url.searchParams.has('token') && !url.searchParams.has('access_token') && url.pathname !== '/login' ? url.pathname + url.search + url.hash : '/repos';} catch {return '/repos';}
}

/** Native modal semantics include Escape and restore the opening control's focus. */
export function ConfirmDialog({open, name, onClose, children}: {open: boolean; name: string; onClose: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement|null>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current!; previous.current = document.activeElement as HTMLElement;
    dialog.showModal();
    return () => {dialog.close(); previous.current?.focus();};
  }, [open]);
  return <dialog ref={ref} aria-label={name} onCancel={event => {event.preventDefault(); onClose();}}>{open && children}</dialog>;
}

/** Exchange the entered bearer, erase it, and authenticate the cookie before success. */
export function ConnectionForm({onConnected}: {onConnected: (principal: Principal) => void}) {
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [errors, setErrors] = useState<string[]>([]);
  async function connect() {
    setBusy(true); setErrors([]);
    try {
      await connectBrowser(token); setToken('');
      const {data} = await createBrowserClient().request<Principal>('/v1/auth/me');
      if (data.kind !== 'session' || !data.alias || !data.sid) throw new Error(sessionKo.notSession);
      onConnected(data);
    } catch (error) {setErrors(errorLines(error));} finally {setToken(''); setBusy(false);}
  }
  return <form aria-label={ko.connection} aria-busy={busy} onSubmit={event => {event.preventDefault(); void connect();}}>
    <label htmlFor="session-token">{ko.token}</label><input id="session-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} required disabled={busy}/>
    <button type="submit" disabled={busy}>{ko.connect}</button><Feedback errors={errors}/>
  </form>;
}

/** Current principal is server-confirmed; an alias selector never grants identity. */
export function SessionBanner({principal}: {principal: Principal|null}) {
  return <section aria-label={sessionKo.current}>{principal ? <dl>{[
    [ko.alias, principal.alias], [sessionKo.sid, principal.sid], [sessionKo.sessionId, principal.sessionId], [sessionKo.expires, principal.expiresAt],
  ].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p>{ko.authRequired}</p>}</section>;
}

interface SessionResult {token?: string; sessionId: string; alias: string; sid: string; expiresAt?: string}
interface SessionRequest {alias: string; sid: string; resumeFrom?: string; reissueOf?: string}

/** Explicit issue/reissue flow keeps a durable request key until its outcome is known. */
export function SessionIssueForm({onConnected, principal}: {onConnected: (principal: Principal) => void; principal?: Principal|null}) {
  const [secret, setSecret] = useState(''), [alias, setAlias] = useState(''), [sid, setSid] = useState('s1'), [resumeFrom, setResumeFrom] = useState('');
  const [result, setResult] = useState<SessionResult|null>(null), [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [reissue, setReissue] = useState(false), [newSid, setNewSid] = useState('s2'), [reveal, setReveal] = useState(false);
  const pending = useRef<{key: string; body: SessionRequest}|null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [registryCandidates, setRegistryCandidates] = useState(false);
  useEffect(() => {
    if (!principal?.owner) return;
    const abort = new AbortController();
    void allPages<{name: string; status: string}>(createBrowserClient(), `/v1/owners/${encodeURIComponent(principal.owner)}/aliases`, abort.signal).then(items => {if (!abort.signal.aborted) {setCandidates(items.filter(item => item.status === 'active').map(item => item.name)); setRegistryCandidates(true);}}).catch(() => {if (!abort.signal.aborted) {setCandidates(principal.alias ? [principal.alias] : []); setRegistryCandidates(false);}});
    return () => abort.abort();
  }, [principal]);
  async function issue(retry = false, replacing = false) {
    setBusy(true); setErrors([]); setStatus('');
    if (!retry) pending.current = {key: crypto.randomUUID(), body: replacing ? {alias: result!.alias, sid: newSid, reissueOf: result!.sessionId} : {alias, sid, ...(resumeFrom ? {resumeFrom} : {})}};
    try {
      const request = pending.current!;
      const response = await createBrowserClient(secret).write<SessionResult>('/v1/sessions', {method: 'POST', ...request});
      setResult(response); setSecret(''); setReveal(false); setStatus(sessionKo.issued); setReissue(false); pending.current = null;
    } catch (error) {
      if (error instanceof ClientError && error.code === 'SESSION_TOKEN_NOT_REPLAYABLE') {
        const details = error.details ?? {};
        setResult({sessionId: String(details.sessionId ?? ''), alias: String(details.alias ?? pending.current!.body.alias), sid: String(details.sid ?? pending.current!.body.sid)});
        setStatus(sessionKo.notReplayable); pending.current = null;
      }
      setErrors(errorLines(error));
      if (error instanceof ClientError && error.status >= 400 && error.code !== 'SESSION_TOKEN_NOT_REPLAYABLE') pending.current = null;
    } finally {setBusy(false);}
  }
  async function connectIssued() {
    setBusy(true); setErrors([]);
    const token = result?.token;
    setResult(value => value ? {...value, token: undefined} : null); setReveal(false);
    try {if (!token) return; await connectBrowser(token); const {data} = await createBrowserClient().request<Principal>('/v1/auth/me'); onConnected(data);} catch (error) {setErrors(errorLines(error));} finally {setBusy(false);}
  }
  return <section aria-label={sessionKo.issue}><form aria-label={sessionKo.issue} aria-busy={busy} onSubmit={event => {event.preventDefault(); void issue(!!pending.current);}}>
    <p>{sessionKo.bootstrapOnly}</p>
    <label htmlFor="management-token">{sessionKo.managementToken}</label><input id="management-token" type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} required disabled={busy}/>
    <fieldset disabled={busy || !!pending.current}><label htmlFor="issue-alias">{ko.alias}</label><input id="issue-alias" list="session-alias-candidates" value={alias} onChange={event => setAlias(event.target.value)} required/><datalist id="session-alias-candidates">{candidates.map(name => <option key={name} value={name}/>)}</datalist>
      <p>{registryCandidates ? rosterKo.registrySource : sessionKo.candidate}</p><label htmlFor="issue-sid">{sessionKo.sid}</label><input id="issue-sid" value={sid} onChange={event => setSid(event.target.value)} required/>
      <label htmlFor="issue-resume">{sessionKo.resumeFrom}</label><input id="issue-resume" value={resumeFrom} onChange={event => setResumeFrom(event.target.value)}/></fieldset>
    <button disabled={busy}>{pending.current ? sessionKo.retry : sessionKo.issueExecute}</button>
    <Feedback errors={errors} status={status}/>
  </form>{result && <section aria-label={sessionKo.issuedToken}><dl><div><dt>{sessionKo.sessionId}</dt><dd>{result.sessionId}</dd></div><div><dt>{ko.alias}</dt><dd>{result.alias}</dd></div><div><dt>{sessionKo.sid}</dt><dd>{result.sid}</dd></div></dl>
    {result.token && <><label htmlFor="issued-token">{sessionKo.issuedToken}</label><input id="issued-token" readOnly autoComplete="off" type={reveal ? 'text' : 'password'} value={result.token}/>
      <button onClick={() => setReveal(value => !value)}>{reveal ? sessionKo.mask : sessionKo.reveal}</button>
      <button onClick={() => {void navigator.clipboard.writeText(result.token!).then(() => setStatus(sessionKo.copied)).catch(() => setErrors([ko.failure]));}}>{sessionKo.copy}</button>
      <button disabled={busy} onClick={() => void connectIssued()}>{sessionKo.connectIssued}</button></>}
    <button onClick={() => {setResult(null); setStatus(''); setSecret(''); setReveal(false);}}>{sessionKo.discard}</button>
    {result.sessionId && <button onClick={() => setReissue(true)}>{sessionKo.reissue}</button>}
  </section>}
    <ConfirmDialog open={reissue} name={sessionKo.reissue} onClose={() => {setReissue(false); setSecret('');}}>
      <h2>{sessionKo.reissue}</h2><p>{sessionKo.revokeImpact}</p><p>{sessionKo.reissueOf}: {result?.sessionId}</p>
      <form onSubmit={event => {event.preventDefault(); void issue(false, true);}} aria-busy={busy}>
        <label htmlFor="reissue-sid">{sessionKo.newSid}</label><input id="reissue-sid" value={newSid} onChange={event => setNewSid(event.target.value)} required/>
        <label htmlFor="reissue-secret">{sessionKo.managementToken}</label><input id="reissue-secret" type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} required/>
        <button disabled={busy}>{sessionKo.reissueExecute}</button><button type="button" onClick={() => {setReissue(false); setSecret('');}}>{ko.cancel}</button><Feedback errors={errors}/>
      </form>
    </ConfirmDialog>
  </section>;
}

/** Revocation is explicit and affects the actual agent session, not just this panel. */
export function RevokeSession({client, principal}: {client: IssusClient; principal: Principal}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [errors, setErrors] = useState<string[]>([]);
  const key = useRef<string|null>(null);
  return <><button disabled={!principal.sessionId} onClick={() => setOpen(true)}>{sessionKo.revoke}</button>
    <ConfirmDialog open={open} name={sessionKo.revokeDialog} onClose={() => setOpen(false)}><h2>{sessionKo.revokeDialog}</h2><p>{sessionKo.revokeImpactSelf}</p>
      <button disabled={busy} onClick={() => {setBusy(true); key.current ??= crypto.randomUUID(); void client.write(`/v1/sessions/${encodeURIComponent(principal.sessionId!)}`, {method: 'DELETE', key: key.current}).then(() => {clearBrowserSession(); setOpen(false);}).catch(error => {setErrors(errorLines(error)); if (error instanceof ClientError && error.status >= 400) key.current = null;}).finally(() => setBusy(false));}}>{sessionKo.revokeExecute}</button>
      <button onClick={() => setOpen(false)}>{ko.cancel}</button><Feedback errors={errors}/></ConfirmDialog></>;
}
