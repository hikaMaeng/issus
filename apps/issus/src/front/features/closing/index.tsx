import {useRef, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines} from '../../entry/client/index.js';
import {ko} from '../../resources/index.js';

/** Native confirmation dialog exposes authoritative blocker IDs on failure. */
export function Closing({client, path, revision, onClosed}: {client: IssusClient; path: string; revision: number; onClosed: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(''), [report, setReport] = useState(''), [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function close() {
    setErrors([]); setBusy(true);
    try {await client.write(path + '/close', {method: 'POST', key: crypto.randomUUID(), revision, body: {reason, finalReportId: report}}); setDone(true); dialog.current?.close(); onClosed();}
    catch (error) {setErrors(errorLines(error));} finally {setBusy(false);}
  }
  return <section><button onClick={() => dialog.current?.showModal()}>{ko.close}</button>
    {done && <p role="status">{ko.closedSuccess}</p>}
    <dialog ref={dialog} aria-labelledby="close-heading"><h2 id="close-heading">{ko.closeDialog}</h2>
      <form onSubmit={event => {event.preventDefault(); void close();}} aria-label={ko.closeDialog} aria-busy={busy}>
        <label htmlFor="close-report">{ko.finalReport}</label><input id="close-report" value={report} onChange={event => setReport(event.target.value)} required pattern="[0-9]+"/>
        <label htmlFor="close-reason">{ko.closeReason}</label><textarea id="close-reason" value={reason} onChange={event => setReason(event.target.value)} required/>
        {errors.length > 0 && <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
        <button disabled={busy} type="submit">{ko.closeExecute}</button><button disabled={busy} type="button" onClick={() => dialog.current?.close()}>{ko.cancel}</button>
      </form>
    </dialog>
  </section>;
}
