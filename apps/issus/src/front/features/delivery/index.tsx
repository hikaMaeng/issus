import {useEffect, useRef, useState} from 'react';
import {header, type InboxItem} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, repoPath, type CommentView, type Principal} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {deliveryLabels, ko} from '../../resources/index.js';
import {inboxKo} from '../../resources/inbox.js';
import {deliveryIssue, DeliveryWrite} from './model.js';
export {orderDeliveries, mergeInboxSnapshot, issueNumbers, deliveryIssue, DeliveryWrite} from './model.js';

/** Explicit actions preserve request keys until a known outcome; preview never ACKs. */
export function Delivery({item, client, principal, repo, onChanged, now = Date.now(), activeHold = false}: {item: InboxItem; client: IssusClient; principal: Principal; repo: string; onChanged: () => void; now?: number; activeHold?: boolean}) {
  const parsed = header(item.content.body), fields = item.content.envelope ?? parsed.values;
  const directive = ['ASK', 'HOLD', 'DECISION', 'HANDOFF'].includes(parsed._type), issueNumber = deliveryIssue(item);
  const canAck = !!(item.commentId && issueNumber && principal.alias && principal.sid && parsed._from && !parsed._noenv);
  const deadline = fields['ACK-BY'], seconds = deadline ? Math.floor((now-Date.parse(deadline))/1000) : NaN;
  const overdue = Number.isFinite(seconds) && seconds > 0 && !['acked', 'applied', 'superseded'].includes(item.delivery?.state ?? 'posted');
  const [ackContent, setAckContent] = useState<string>(ko.ackContent), [errors, setErrors] = useState<string[]>([]), [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState(''), [outcome, setOutcome] = useState<'applied'|'not-applied'>('applied'), [applicationReason, setApplicationReason] = useState('');
  const [disposition, setDisposition] = useState<'acked'|'replied'>('acked'), [processEvidence, setProcessEvidence] = useState('');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [operation, setOperation] = useState<string|null>(null);
  const [uncertain,setUncertain]=useState(false),writer=useRef(new DeliveryWrite());
  const [otherBody,setOtherBody]=useState<string|null>(null),[otherErrors,setOtherErrors]=useState<string[]>([]),[otherLoading,setOtherLoading]=useState(false);
  const otherAbort=useRef<AbortController|null>(null), pendingRetry=useRef<(()=>Promise<void>)|null>(null);
  useEffect(()=>()=>otherAbort.current?.abort(),[]);
  const ackDialog = useRef<HTMLDialogElement>(null), ignoreDialog = useRef<HTMLDialogElement>(null);
  const identity = item.delivery?.id ?? item.viewKey, articleId = `delivery-comment-${item.commentId ?? item.sourceEventId}`;
  const preview = canAck ? `FROM:${principal.alias}/${principal.sid} TO:${parsed._from} TYPE:ACK RE:${item.commentId}\n${ackContent}\n${ko.ackNext}` : '';
  async function write<T>(path: string, body: unknown): Promise<T> {
    try {return await writer.current.run<T>(client,path,body,setOperation);}
    finally {setUncertain(!!writer.current.pending);if(!writer.current.pending)setOperation(null);}
  }
  async function run(action: () => Promise<void>) {pendingRetry.current=action;setErrors([]); setStatus(''); setBusy(true); try {await action(); onChanged();} catch(error) {setErrors(errorLines(error));} finally {setBusy(false);}}
  async function expandOther() {if(otherBody!==null||otherLoading||!item.commentId)return;const abort=new AbortController();otherAbort.current=abort;setOtherLoading(true);setOtherErrors([]);try{const {data}=await client.request<CommentView>(repoPath(repo)+'/comments/'+encodeURIComponent(item.commentId),{signal:abort.signal});if(!abort.signal.aborted)setOtherBody(data.body);}catch(error){if(!abort.signal.aborted)setOtherErrors(errorLines(error));}finally{if(!abort.signal.aborted)setOtherLoading(false);}}
  async function ack() {await run(async () => {const result = await write<{commentId:string}>(issuePath(repo,issueNumber!)+'/comments',{body:preview}); setStatus(ko.posted(result.commentId)); ackDialog.current?.close();});}
  async function inspectAck() {await run(async () => {await client.request(issuePath(repo,issueNumber!)+'/preflight',{method:'POST',body:{mode:'comment',request:{body:preview}}}); setStatus(inboxKo.ackChecked);});}
  const original = item.commentId && issueNumber ? `/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${issueNumber}#comment-${item.commentId}` : undefined;
  const raw = <pre>{item.content.body}</pre>;
  return <li><article id={articleId} aria-label={ko.delivery(identity)} data-testid="delivery" data-delivery-id={item.delivery?.id}>
    <h2>{item.priority} · {item.commentId ?? item.viewKey}</h2><Envelope fields={fields} client={client} repo={repo}/>
    {!item.commentId&&<p>{inboxKo.serverFact}: {item.sourceEventId}</p>}
    {original && <a href={original}>{inboxKo.source}</a>}
    <p data-testid="delivery-state" data-state={item.delivery?.state ?? 'posted'} aria-label={inboxKo.fields}>
      <span>{deliveryLabels[item.delivery?.state ?? 'posted']}</span> · {inboxKo.states[item.delivery?.state ?? 'posted']}
      {item.delivery && <> · {ko.attempt}: {item.delivery.attempt} · {inboxKo.version}: {item.delivery.aliasEventSequence}</>}
    </p>
    {deadline && <p>{ko.deadline}: <time dateTime={deadline}>{deadline}</time> · {Number.isFinite(seconds) && (seconds>0 ? inboxKo.elapsed(seconds) : inboxKo.countdown(-seconds))}</p>}
    {overdue && <p role="alert">{ko.overdue}</p>}{activeHold && <p role="alert">{inboxKo.holds}</p>}{parsed._noenv && <p role="alert">{ko.noenv}</p>}
    {item.priority === 'OTHER' && !['HOLD','DECISION'].includes(parsed._type) ? <details onToggle={event=>{if(event.currentTarget.open)void expandOther();}}><summary role="button">{inboxKo.rawOther(item.commentId ?? item.viewKey)}</summary>{otherLoading?<p role="status" aria-busy="true">{ko.loading}</p>:<pre>{otherBody??item.content.body}</pre>}{otherErrors.length>0&&<div role="alert">{otherErrors.map((line,index)=><p key={index}>{line}</p>)}</div>}</details> : raw}
    {status && <p role="status">{status}</p>}
    {(operation||uncertain) && <section aria-label={inboxKo.operation}><p role="status">{inboxKo.operationPending}{operation?`: ${operation}`:''}</p><button type="button" disabled={busy} onClick={()=>{if(pendingRetry.current)void run(pendingRetry.current);}}>{inboxKo.retry}</button></section>}
    {errors.length > 0 && <div role="alert">{errors.map((message,index)=><p key={index}>{message}</p>)}</div>}
    <fieldset disabled={busy||uncertain||!!operation}><div role="group" aria-label={inboxKo.fields}>
      <button type="button" disabled={busy || !item.delivery} onClick={() => void run(async () => {await write('/v1/deliveries/receipts',{deliveryIds:[item.delivery!.id],attempts:[item.delivery!.attempt]}); setStatus(inboxKo.receiptDone);})}>{inboxKo.receipt}</button>
      <button type="button" disabled={busy || !canAck} aria-describedby={!canAck ? `ack-${identity}` : undefined} onClick={() => {setErrors([]); ackDialog.current?.showModal();}}>{ko.ack}</button>
      {!canAck && <p id={`ack-${identity}`}>{ko.invalidAck}</p>}
      <button type="button" disabled={busy || directive || !item.delivery} aria-describedby={directive ? `ignore-${identity}` : undefined} onClick={() => {setErrors([]); ignoreDialog.current?.showModal();}}>{ko.ignore}</button>
      {directive && <p id={`ignore-${identity}`}>{ko.directiveIgnore}</p>}
    </div>
    {item.delivery && <>
      <form aria-label={inboxKo.process} onSubmit={event => {event.preventDefault(); void run(async () => {await write('/v1/inbox/process',{deliveryIds:[item.delivery!.id],disposition,evidenceCommentId:processEvidence}); setStatus(inboxKo.processDone);});}}>
        <label htmlFor={`process-${identity}`}>{inboxKo.disposition}</label><select id={`process-${identity}`} value={disposition} onChange={event=>setDisposition(event.target.value as 'acked'|'replied')}><option value="acked">{inboxKo.acked}</option><option value="replied">{inboxKo.replied}</option></select>
        <label htmlFor={`process-evidence-${identity}`}>{inboxKo.evidence}</label><input id={`process-evidence-${identity}`} value={processEvidence} onChange={event=>setProcessEvidence(event.target.value)} required pattern="[0-9]+"/>
        <p>{inboxKo.processHelp}</p><button type="submit" disabled={busy}>{inboxKo.process}</button>
      </form>
      <form aria-label={inboxKo.application} onSubmit={event=>{event.preventDefault(); void run(async()=>{await write(`/v1/deliveries/${encodeURIComponent(item.delivery!.id)}/application`,{evidenceCommentId:evidence,outcome,...(outcome==='not-applied'?{reason:applicationReason}:{})}); setStatus(inboxKo.applicationDone);});}}>
        <p>{inboxKo.evidenceHelp}</p><label htmlFor={`application-evidence-${identity}`}>{inboxKo.evidence}</label><input id={`application-evidence-${identity}`} value={evidence} onChange={event=>setEvidence(event.target.value)} required pattern="[0-9]+"/>
        <label htmlFor={`outcome-${identity}`}>{inboxKo.outcome}</label><select id={`outcome-${identity}`} value={outcome} onChange={event=>setOutcome(event.target.value as 'applied'|'not-applied')}><option value="applied">{inboxKo.applied}</option><option value="not-applied">{inboxKo.notApplied}</option></select>
        <label htmlFor={`application-reason-${identity}`}>{inboxKo.reason}</label><textarea id={`application-reason-${identity}`} value={applicationReason} onChange={event=>setApplicationReason(event.target.value)} required={outcome==='not-applied'}/>
        <button type="submit" disabled={busy}>{inboxKo.application}</button>
      </form>
    </>}</fieldset>
    <dialog ref={ackDialog} aria-label={ko.ackDialog}><h2>{ko.ackDialog}</h2><p>{ko.preview}</p>
      <fieldset disabled={busy||uncertain||!!operation}><label htmlFor={`ack-body-${identity}`}>{inboxKo.ackBody}</label><textarea id={`ack-body-${identity}`} value={ackContent} onChange={event=>setAckContent(event.target.value)}/><pre>{preview}</pre>
      {errors.length>0 && <div role="alert">{errors.map((message,index)=><p key={index}>{message}</p>)}</div>}{status && <p role="status">{status}</p>}
      <button type="button" disabled={busy} onClick={()=>void inspectAck()}>{inboxKo.ackCheck}</button><button type="button" disabled={busy} onClick={()=>void ack()}>{ko.ackExecute}</button></fieldset><button type="button" onClick={()=>ackDialog.current?.close()}>{ko.cancel}</button>
    </dialog>
    <dialog ref={ignoreDialog} aria-label={ko.ignoreDialog}><h2>{ko.ignoreDialog}</h2><form aria-label={ko.ignoreDialog} onSubmit={event=>{event.preventDefault(); void run(async()=>{await write('/v1/inbox/process',{deliveryIds:[item.delivery!.id],disposition:'ignored',reason}); setStatus(ko.ignored); ignoreDialog.current?.close();});}}>
      <fieldset disabled={busy||uncertain||!!operation}><label htmlFor={`reason-${identity}`}>{ko.ignoreReason}</label><textarea id={`reason-${identity}`} value={reason} onChange={event=>setReason(event.target.value)} required/>
      {errors.length>0 && <div role="alert">{errors.map((message,index)=><p key={index}>{message}</p>)}</div>}
      <button disabled={busy} type="submit">{ko.ignoreExecute}</button></fieldset><button type="button" onClick={()=>ignoreDialog.current?.close()}>{ko.cancel}</button>
    </form></dialog>
  </article></li>;
}
