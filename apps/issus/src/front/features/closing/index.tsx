import {useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, ClientError} from '../../entry/client/index.js';
import {ReferenceLink, issueHref} from '../reference/index.js';
import {ConfirmDialog} from '../session/index.js';
import {useWriteOperation, OperationState, STATES} from '../composer/index.js';
import {blockerReferences} from './model.js';
import {ko} from '../../resources/index.js';
import {issueKo} from '../../resources/issue.js';
import {composerKo} from '../../resources/composer.js';
export {blockerReferences} from './model.js';

/** Native confirmation dialog exposes authoritative blocker IDs on failure. */
export function Closing({client, path, revision, onClosed, repo, isOpen = true, replyIn, diagnostics}: {client: IssusClient; path: string; revision: number; onClosed: () => void; repo?: string; isOpen?: boolean; replyIn?: string; diagnostics?: Record<string,unknown>}) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [report, setReport] = useState(''), [errors, setErrors] = useState<string[]>([]), [details, setDetails] = useState<Record<string,unknown>>(), [done, setDone] = useState(''), [state, setState] = useState('running');
  const operation = useWriteOperation();
  async function close() {
    setErrors([]); setDetails(undefined);
    const closing = operation.uncertain ? operation.pendingPath?.endsWith('/close') ?? isOpen : isOpen;
    try {await operation.run(client, path + (closing ? '/close' : '/reopen'), {method: 'POST', revision, body: closing ? {reason, finalReportId: report} : {reason, state}}); setDone(closing ? ko.closedSuccess : issueKo.reopened); setOpen(false); onClosed();}
    catch (error) {setErrors(errorLines(error)); if (error instanceof ClientError) setDetails(error.details);}
  }
  const followup = repo && issueHref(repo, replyIn);
  return <section><button type="button" onClick={() => setOpen(true)}>{isOpen ? ko.close : issueKo.reopen}</button>
    {done && <p role="status">{done}</p>}{followup && <a href={followup}>{issueKo.followup}</a>}
    <ConfirmDialog open={open} name={isOpen ? ko.closeDialog : issueKo.reopen} onClose={() => setOpen(false)}><h2>{isOpen ? ko.closeDialog : issueKo.reopen}</h2>
      <form onSubmit={event => {event.preventDefault(); void close();}} aria-label={isOpen ? ko.closeDialog : issueKo.reopen} aria-busy={operation.busy}>
        <p>{issueKo.closeHint}</p><p>{issueKo.beforeClose}</p>
        {diagnostics && <section aria-label={issueKo.closeChecks}><ul>
          <li>{issueKo.checkNames.state}: {String(diagnostics.STATE ?? issueKo.absent)}</li><li>{issueKo.checkNames.finalReport}: {report || issueKo.absent} · {issueKo.serverCheck}</li><li>{issueKo.checkNames.compact}: {String(diagnostics.COMPACT ?? issueKo.absent)} · {issueKo.serverCheck}</li>
          {(['activeHolds','claims','ackState','pendingLegacy'] as const).map(key => <li key={key}>{key}: {diagnostics[key] === undefined ? issueKo.serverCheck : JSON.stringify(diagnostics[key])}</li>)}<li>{issueKo.checkNames.handoffs}: {issueKo.serverCheck}</li>
        </ul></section>}
        {isOpen ? <><label htmlFor="close-report">{ko.finalReport}</label><input id="close-report" disabled={operation.locked} value={report} onChange={event => setReport(event.target.value)} required pattern="[0-9]+"/></> : <><label htmlFor="reopen-state">{issueKo.reopenState}</label><select id="reopen-state" disabled={operation.locked} value={state} onChange={event => setState(event.target.value)}>{STATES.map(value => <option key={value}>{value}</option>)}</select></>}
        <label htmlFor="close-reason">{isOpen ? ko.closeReason : issueKo.reopenReason}</label><textarea id="close-reason" disabled={operation.locked} value={reason} onChange={event => setReason(event.target.value)} required/>
        {errors.length > 0 && <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
        {details && <section aria-label={issueKo.blockers}>{blockerReferences(details).map(({kind, id}) => <p key={`${kind}:${id}`}>{issueKo.checkNames[kind as keyof typeof issueKo.checkNames] ?? kind}: {repo ? <ReferenceLink client={client} repo={repo} id={id} onFollow={() => setOpen(false)}/> : id}</p>)}</section>}
        <button disabled={operation.busy} type="submit">{operation.uncertain ? composerKo.retry : isOpen ? ko.closeExecute : issueKo.reopen}</button><button type="button" onClick={() => setOpen(false)}>{ko.cancel}</button><OperationState operation={operation}/>
      </form>
    </ConfirmDialog>
  </section>;
}
