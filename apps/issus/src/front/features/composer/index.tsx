import {useRef, useState, type FormEvent} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, ClientError, OperationTimeout} from '../../entry/client/index.js';
import {ko} from '../../resources/index.js';

/** Inspect and post use server validation; server reasons are rendered verbatim. */
export function Composer({client, path, onPosted}: {client: IssusClient; path: string; onPosted: () => void}) {
  const [body, setBody] = useState(''), [errors, setErrors] = useState<string[]>([]), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<{body: string; key: string}|undefined>(undefined);
  async function act(post: boolean) {
    setBusy(true); setErrors([]); setStatus('');
    try {
      if (post) {
        if (pending.current?.body !== body) pending.current = {body, key: crypto.randomUUID()};
        const result = await client.write<{commentId: string}>(path + '/comments', {method: 'POST', key: pending.current!.key, body: {body}});
        pending.current = undefined; setStatus(ko.posted(result.commentId)); setBody(''); onPosted();
      } else {
        await client.request(path + '/preflight', {method: 'POST', body: {mode: 'comment', request: {body}}}); setStatus(ko.valid);
      }
    } catch (error) {if (!(error instanceof OperationTimeout) && !(error instanceof ClientError && error.status === 0)) pending.current = undefined; setErrors(errorLines(error));} finally {setBusy(false);}
  }
  return <form aria-label={ko.composer} aria-busy={busy} onSubmit={(event: FormEvent) => {event.preventDefault(); void act(true);}}>
    <h2>{ko.composer}</h2><label htmlFor="comment-body">{ko.commentBody}</label>
    <textarea id="comment-body" disabled={busy} value={body} onChange={event => {setBody(event.target.value); setErrors([]); setStatus('');}} aria-invalid={errors.length > 0} aria-describedby={errors.length ? 'composer-errors' : undefined}/>
    {errors.length > 0 && <div role="alert" id="composer-errors">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
    {status && <p role="status">{status}</p>}
    <button type="button" disabled={busy} onClick={() => void act(false)}>{ko.validate}</button><button disabled={busy} type="submit">{ko.post}</button>
  </form>;
}
