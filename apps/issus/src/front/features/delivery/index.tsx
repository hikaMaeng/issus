import {useRef, useState} from 'react';
import {header, type InboxItem} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, issuePath, type Principal} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {deliveryLabels, ko} from '../../resources/index.js';

/** Preview is explicit; displaying or receiving a delivery never fabricates a user ACK. */
export function Delivery({item, client, principal, repo, onChanged}: {item: InboxItem; client: IssusClient; principal: Principal; repo: string; onChanged: () => void}) {
  const parsed = header(item.content.body), fields = item.content.envelope ?? parsed.values;
  const directive = ['ASK', 'HOLD', 'DECISION', 'HANDOFF'].includes(parsed._type);
  const issueNumber = /:issue:[0-9a-f-]+:(\d+)$/i.exec(item.sourceStreamId)?.[1];
  const canAck = !!(item.commentId && issueNumber && principal.alias && principal.sid && parsed._from && !parsed._noenv);
  const deadline = fields['ACK-BY'], overdue = deadline && Date.parse(deadline) < Date.now() && !['acked', 'applied', 'superseded'].includes(item.delivery?.state ?? 'posted');
  const preview = canAck ? `FROM:${principal.alias}/${principal.sid} TO:${parsed._from} TYPE:ACK RE:${item.commentId}\n${ko.ackContent}\n${ko.ackNext}` : '';
  const ackDialog = useRef<HTMLDialogElement>(null), ignoreDialog = useRef<HTMLDialogElement>(null);
  const [errors, setErrors] = useState<string[]>([]), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  async function ack() {
    setErrors([]); setBusy(true);
    try {
      const result = await client.write<{commentId: string}>(issuePath(repo, Number(issueNumber)) + '/comments', {method: 'POST', key: crypto.randomUUID(), body: {body: preview}});
      setStatus(ko.posted(result.commentId)); ackDialog.current?.close(); onChanged();
    } catch (error) {setErrors(errorLines(error));} finally {setBusy(false);}
  }
  async function ignore() {
    setErrors([]); setBusy(true);
    try {await client.write('/v1/inbox/process', {method: 'POST', key: crypto.randomUUID(), body: {deliveryIds: [item.delivery!.id], disposition: 'ignored', reason}}); setStatus(ko.ignored); ignoreDialog.current?.close(); onChanged();}
    catch (error) {setErrors(errorLines(error));} finally {setBusy(false);}
  }
  const identity = item.delivery?.id ?? item.viewKey;
  return <li><article aria-label={ko.delivery(identity)} data-testid="delivery" data-delivery-id={item.delivery?.id}>
    <h2>{item.priority} · {item.commentId ?? item.viewKey}</h2><Envelope fields={fields}/>
    {item.delivery && <p><span>{deliveryLabels[item.delivery.state]}</span> · {ko.attempt}: {item.delivery.attempt}</p>}
    {deadline && <p>{ko.deadline}: <time dateTime={deadline}>{deadline}</time></p>}
    {overdue && <p role="alert">{ko.overdue}</p>}{parsed._noenv && <p role="alert">{ko.noenv}</p>}
    <pre>{item.content.body}</pre>
    {status && <p role="status">{status}</p>}
    <button type="button" disabled={!canAck} aria-describedby={!canAck ? `ack-${identity}` : undefined} onClick={() => {setErrors([]); ackDialog.current?.showModal();}}>{ko.ack}</button>
    {!canAck && <p id={`ack-${identity}`}>{ko.invalidAck}</p>}
    <button type="button" disabled={directive || !item.delivery} aria-describedby={directive ? `ignore-${identity}` : undefined} onClick={() => {setErrors([]); ignoreDialog.current?.showModal();}}>{ko.ignore}</button>
    {directive && <p id={`ignore-${identity}`}>{ko.directiveIgnore}</p>}
    <dialog ref={ackDialog} aria-label={ko.ackDialog}><h2>{ko.ackDialog}</h2><p>{ko.preview}</p><pre>{preview}</pre>
      {errors.length > 0 && <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
      <button type="button" disabled={busy} onClick={() => void ack()}>{ko.ackExecute}</button><button type="button" disabled={busy} onClick={() => ackDialog.current?.close()}>{ko.cancel}</button>
    </dialog>
    <dialog ref={ignoreDialog} aria-label={ko.ignoreDialog}><h2>{ko.ignoreDialog}</h2><form aria-label={ko.ignoreDialog} onSubmit={event => {event.preventDefault(); void ignore();}}>
      <label htmlFor={`reason-${identity}`}>{ko.ignoreReason}</label><textarea id={`reason-${identity}`} value={reason} onChange={event => setReason(event.target.value)} required/>
      {errors.length > 0 && <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
      <button disabled={busy} type="submit">{ko.ignoreExecute}</button><button type="button" disabled={busy} onClick={() => ignoreDialog.current?.close()}>{ko.cancel}</button>
    </form></dialog>
  </article></li>;
}
