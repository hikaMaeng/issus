import {useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, type Principal, type CommentView} from '../../entry/client/index.js';
import {ConfirmDialog, useSessionDraft} from '../session/index.js';
import {quickDraft, useWriteOperation, OperationState, type ComposerDraft} from '../composer/index.js';
import {ko} from '../../resources/index.js';
import {composerKo} from '../../resources/composer.js';
import {issueKo} from '../../resources/issue.js';

/** Preview and cancellation never submit an ACK. A separate click posts its edited draft. */
export function QuickReply({client, path, principal, comment, seen, onDraft, onPosted, noenv = false, board = false}: {
  client: IssusClient; path: string; principal: Principal; comment: CommentView; seen: string;
  onDraft?: (draft: ComposerDraft) => void; onPosted?: () => void; noenv?: boolean; board?: boolean;
}) {
  const [open, setOpen] = useState(false), [body, setBody] = useSessionDraft(`quick-ack:${path}:${comment.id}:body`, ''), [errors, setErrors] = useState<string[]>([]), [status, setStatus] = useState(''), [checking, setChecking] = useState(false);
  const operation = useWriteOperation(), from = principal.alias ? `${principal.alias}/${principal.sid ?? 's1'}` : '';
  function draft(kind: 'ACK'|'HOLD'|'DECISION'|'RELEASE'|'NOENV') {return quickDraft(kind, from, comment, seen);}
  async function submit(post: boolean) {
    setErrors([]); setStatus('');
    try {
      if (post) {const result = await operation.run<{commentId: string}>(client, path + '/comments', {method: 'POST', body: {body}}); setStatus(ko.posted(result.commentId)); setOpen(false); onPosted?.();}
      else {setChecking(true); await client.request(path + '/preflight', {method: 'POST', body: {mode: 'comment', request: {body}}}); setStatus(ko.valid);}
    } catch (error) {setErrors(errorLines(error));} finally {setChecking(false);}
  }
  async function prepare(kind: 'HOLD'|'DECISION'|'RELEASE'|'NOENV') {
    setErrors([]);
    if (kind === 'DECISION' && comment.envelope.TYPE === 'HOLD') {
      setChecking(true);
      try {
        const {data} = await client.request<{activeHolds: string[]; envelope: Record<string,string>}>(path);
        if (!data.activeHolds.includes(comment.id)) {setErrors([composerKo.inactiveHold]); return;}
        const alias = principal.alias?.toLowerCase();
        if (principal.kind !== 'bootstrap' && alias !== comment.envelope.FROM?.split('/')[0].toLowerCase() && alias !== data.envelope.OWNER?.toLowerCase()) {setErrors([issueKo.permission]); return;}
      } catch (error) {setErrors(errorLines(error)); return;} finally {setChecking(false);}
    }
    onDraft?.({body: draft(kind), key: crypto.randomUUID()});
  }
  return <><div role="group" aria-label={composerKo.quick}>
    {noenv ? !board && onDraft && <button type="button" disabled={!from || checking} onClick={() => void prepare('NOENV')}>{composerKo.noenv}</button> : <>
      <button type="button" disabled={!from} onClick={() => {if (!body && !operation.uncertain) {setBody(draft('ACK')); setErrors([]); setStatus('');} setOpen(true);}}>{ko.ack}</button>
      {!board && onDraft && <><button type="button" disabled={!from || checking} onClick={() => void prepare('HOLD')}>{composerKo.hold}</button><button type="button" disabled={!from || checking} onClick={() => void prepare('DECISION')}>{composerKo.decision}</button>
        {comment.envelope.TYPE === 'CLAIM' && comment.envelope.FROM?.split('/')[0].toLowerCase() === principal.alias?.toLowerCase() && <button type="button" onClick={() => void prepare('RELEASE')}>{composerKo.release}</button>}</>}
    </>}
  </div>{status && !open && <p role="status">{status}</p>}{!open && errors.length > 0 && <div role="alert">{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}{!open && <OperationState operation={operation}/>}
  <ConfirmDialog open={open} name={ko.ackDialog} onClose={() => setOpen(false)}><h2>{ko.ackDialog}</h2><p>{composerKo.ackHint}</p>
    <form aria-label={ko.ackDialog} noValidate aria-busy={operation.busy || checking} onSubmit={event => {event.preventDefault(); void submit(true);}}>
      <label htmlFor={`ack-body-${comment.id}`}>{composerKo.ackBody}</label><textarea id={`ack-body-${comment.id}`} disabled={operation.locked || checking} value={body} onChange={event => {setBody(event.target.value); setErrors([]); setStatus('');}}/><pre>{body}</pre>
      {errors.length > 0 && <div role="alert">{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}{status && <p role="status">{status}</p>}
      <button type="button" disabled={operation.locked || checking} onClick={() => void submit(false)}>{ko.validate}</button><button type="submit" disabled={operation.busy || checking}>{operation.uncertain ? composerKo.retry : ko.ackExecute}</button><button type="button" onClick={() => setOpen(false)}>{ko.cancel}</button><OperationState operation={operation}/>
    </form></ConfirmDialog></>;
}
