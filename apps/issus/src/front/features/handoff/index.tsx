import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import type {HandoffView} from 'issus_domain/common';
import {errorLines, issuePath, repoPath, readInbox, type CommentView, type IssueView, type Principal} from '../../entry/client/index.js';
import {ConfirmDialog} from '../session/index.js';
import {ReferenceLink, issueHref} from '../reference/index.js';
import {protocolTime, serializeDraft, useWriteOperation, OperationState, TimeAssist} from '../composer/index.js';
import {handoffPermissions} from './model.js';
import {ko} from '../../resources/index.js';
import {issueKo} from '../../resources/issue.js';
import {composerKo} from '../../resources/composer.js';
export {handoffPermissions} from './model.js';

/** HANDOFF posting, direct ACK acceptance and OWNER completion are distinct server-confirmed phases. */
export function Handoff({client, repo, number, principal, owner, revision, onChanged}: {client: IssusClient; repo: string; number: number; principal: Principal|null; owner: string; revision: number; onChanged: () => void}) {
  const [open, setOpen] = useState(false), [to, setTo] = useState(''), [ackBy, setAckBy] = useState(() => protocolTime(new Date(Date.now() + 10 * 60000))), [reply, setReply] = useState(''), [text, setText] = useState(''), [deferred, setDeferred] = useState('');
  const [id, setId] = useState(''), [ack, setAck] = useState(''), [handoffs, setHandoffs] = useState<HandoffView[]>([]), [recipient, setRecipient] = useState(''), [expectedRevision, setExpectedRevision] = useState(revision), [errors, setErrors] = useState<string[]>([]), [status, setStatus] = useState(''), [checking, setChecking] = useState(false), [target, setTarget] = useState<IssueView|null>(null), [targetRef, setTargetRef] = useState(''), [pendingPhase, setPendingPhase] = useState<'post'|'accept'|'complete'|null>(null);
  const operation = useWriteOperation(), path = issuePath(repo, number), current = handoffs.find(row => row.commentId === id), permissions = handoffPermissions(principal, owner, recipient, current?.status);
  useEffect(() => {if (!operation.locked) setExpectedRevision(current => Math.max(current, revision));}, [revision]);
  const body = serializeDraft({fields: {FROM: principal?.alias ? `${principal.alias}/${principal.sid ?? 's1'}` : '', TO: to, TYPE: 'HANDOFF', 'ACK-BY': ackBy, 'REPLY-IN': reply}, text: `${text}\n${issueKo.handoffDirective}`});
  async function refresh(selected = id) {
    setChecking(true); setErrors([]);
    const abort = new AbortController();
    try {
      const [inbox, view] = await Promise.all([readInbox(client, `/v1/inbox?repo=${encodeURIComponent(repo)}&issues=${number}`, abort.signal), client.request<IssueView>(path)]);
      setHandoffs(inbox.response.handoffs); setExpectedRevision(view.data.revision);
      if (selected) {const comment = (await client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(selected)}`)).data; setRecipient(comment.envelope.TO ?? '');}
    } catch (error) {setErrors(errorLines(error));} finally {setChecking(false);}
  }
  async function checkTarget() {
    setChecking(true); setErrors([]); setTarget(null);
    try {const href = issueHref(repo, reply); if (!href) throw new Error(ko.failure); const match = /^\/repos\/(.+)\/issues\/(\d+)$/.exec(href)!; const result = await client.request<IssueView>(issuePath(match[1].split('/').map(decodeURIComponent).join('/'), Number(match[2]))); setTarget(result.data); setTargetRef(reply); setStatus(result.data.issue.isOpen ? issueKo.targetConfirmed : issueKo.targetClosed);}
    catch (error) {setErrors(errorLines(error));} finally {setChecking(false);}
  }
  async function act(phase: 'check'|'post'|'accept'|'complete') {
    setErrors([]); setStatus('');
    try {
      if (phase === 'check') {setChecking(true); const response = await client.request(path + '/preflight', {method: 'POST', body: {mode: 'comment', request: {body, ...(deferred ? {compactDeferredReason: deferred} : {})}}}); setStatus(ko.valid); void response; return;}
      const actual = operation.uncertain && pendingPhase ? pendingPhase : phase; setPendingPhase(actual);
      const result = await operation.run<{commentId?: string; status?: string}>(client, actual === 'post' ? path + '/comments' : `${path}/handoffs/${encodeURIComponent(id)}/${actual}`, {method: 'POST', body: actual === 'post' ? {body, ...(deferred ? {compactDeferredReason: deferred} : {})} : actual === 'accept' ? {ackCommentId: ack} : {expectedRevision}});
      if (result.commentId) setId(result.commentId);
      setPendingPhase(null); setStatus(actual === 'post' ? issueKo.waitingAck : actual === 'accept' ? issueKo.accepted : issueKo.completed); onChanged(); await refresh(result.commentId ?? id);
    } catch (error) {setErrors(errorLines(error));} finally {setChecking(false);}
  }
  return <><button type="button" onClick={() => {setOpen(true); void refresh();}}>{issueKo.handoff}</button>
    <ConfirmDialog open={open} name={issueKo.handoff} onClose={() => setOpen(false)}><h2>{issueKo.handoff}</h2><p>{issueKo.handoffHint}</p>
      {handoffs.length > 0 && <ul>{handoffs.map(row => <li key={row.commentId}><button type="button" onClick={() => {setId(row.commentId); void refresh(row.commentId);}}>{row.commentId} · {row.status}</button></li>)}</ul>}
      <form aria-label={issueKo.handoffWrite} noValidate aria-busy={operation.busy || checking} onSubmit={event => {event.preventDefault(); void act('post');}}>
        <fieldset disabled={operation.locked || checking || !permissions.write}><legend>{issueKo.handoffWrite}</legend>
          <label htmlFor="handoff-to">TO</label><input id="handoff-to" value={to} onChange={event => setTo(event.target.value)} required/>
          <label htmlFor="handoff-deadline">ACK-BY</label><input id="handoff-deadline" value={ackBy} onChange={event => setAckBy(event.target.value)} required/><TimeAssist field="ACK-BY" id="handoff-deadline" value={ackBy} onChange={setAckBy}/>
          <label htmlFor="handoff-reply">REPLY-IN</label><input id="handoff-reply" value={reply} onChange={event => {setReply(event.target.value); setTarget(null);}} required/><button type="button" onClick={() => void checkTarget()}>{issueKo.targetCheck}</button>
          {target && <p>{target.issue.isOpen ? ko.open : ko.closed}: {target.issue.title}</p>}
          <label htmlFor="handoff-text">{issueKo.handoffText}</label><textarea id="handoff-text" value={text} onChange={event => setText(event.target.value)}/>
          <label htmlFor="handoff-deferred">{composerKo.deferred}</label><textarea id="handoff-deferred" value={deferred} onChange={event => setDeferred(event.target.value)}/><p>{composerKo.deferredHelp}</p>
        </fieldset><section aria-label={issueKo.handoffPreview}><pre>{body}</pre><pre>{JSON.stringify(deferred ? {compactDeferredReason: deferred} : {})}</pre></section>
        <a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${number}/compact`}>{composerKo.compactLink}</a>
        <button type="button" disabled={operation.locked || checking || !permissions.write} onClick={() => void act('check')}>{ko.validate}</button>
        <button type="submit" disabled={operation.locked || checking || !permissions.write || !target?.issue.isOpen || targetRef !== reply}>{issueKo.handoffPost}</button>
      </form>
      <label htmlFor="handoff-id">{issueKo.handoffId}</label><input id="handoff-id" disabled={operation.locked || checking} value={id} onChange={event => {setId(event.target.value); setRecipient('');}}/><button type="button" disabled={operation.locked || checking} onClick={() => void refresh()}>{issueKo.stageCheck}</button>
      {current && <p role="status">{current.status} · {recipient} · <ReferenceLink client={client} repo={repo} id={current.commentId}/></p>}
      <form aria-label={issueKo.handoffAccept} onSubmit={event => {event.preventDefault(); void act('accept');}}><label htmlFor="handoff-ack">{issueKo.ackId}</label><input id="handoff-ack" disabled={operation.locked || checking || !permissions.accept} value={ack} onChange={event => setAck(event.target.value)} required pattern="[0-9]+"/><button type="submit" disabled={operation.locked || checking || !permissions.accept}>{issueKo.accept}</button></form>
      <form aria-label={issueKo.handoffComplete} onSubmit={event => {event.preventDefault(); void act('complete');}}><label htmlFor="handoff-revision">{issueKo.expectedRevision}</label><input id="handoff-revision" type="number" min="1" disabled={operation.locked || checking || !permissions.complete} value={expectedRevision} onChange={event => setExpectedRevision(Number(event.target.value))} required/><button type="submit" disabled={operation.locked || checking || !permissions.complete}>{issueKo.complete}</button></form>
      {errors.length > 0 && <div role="alert">{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}{status && <p role="status">{status}</p>}{checking && <p role="status" aria-busy="true">{ko.loading}</p>}<OperationState operation={operation}/>{operation.uncertain && <button type="button" disabled={operation.busy || checking} onClick={() => void act(pendingPhase ?? 'post')}>{composerKo.retry}</button>}<button type="button" onClick={() => setOpen(false)}>{issueKo.handoffClose}</button>
    </ConfirmDialog></>;
}
