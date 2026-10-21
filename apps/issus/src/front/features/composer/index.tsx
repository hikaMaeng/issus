import {useEffect, useRef, useState, type FormEvent} from 'react';
import {header} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, errorReasons, allPages, type Principal, type ValidationReason} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {ConfirmDialog, useSessionDraft} from '../session/index.js';
import {ko} from '../../resources/index.js';
import {composerKo} from '../../resources/composer.js';
import {TYPES, fieldKeys, boardTypes, parseDraft, serializeDraft, draftSize, requiredFields, composerReasonField, fieldFeedback, type Draft} from './model.js';
import {useWriteOperation, OperationState} from './mutation.js';
import {ComposerField, FieldErrors} from './fields.js';

export {TYPES, STATES, fieldKeys, boardTypes, parseDraft, serializeDraft, draftSize, requiredFields, quickDraft, protocolTime, composerReasonField} from './model.js';
export {WriteAttempt, useWriteOperation, OperationState} from './mutation.js';
export {TimeAssist} from './time.js';
export interface ComposerDraft {body: string; key: string}
interface Preflight {context?: {checkedAt: string; revision: number}; compact?: {due: boolean; reasons: string[]; count: number; chars: number}}

/** Fields are editing affordances. The raw string remains the exact preflight and POST payload. */
export function Composer({client, path, onPosted, principal: supplied, revision, board = false, compactHref, draft}: {
  client: IssusClient; path: string; onPosted: () => void; principal?: Principal|null; revision?: number;
  board?: boolean; compactHref?: string; draft?: ComposerDraft;
}) {
  const [body, setBody] = useSessionDraft('composer.body', ''), [fields, setFields] = useSessionDraft<Draft>('composer.fields', {fields: {FROM: supplied?.alias ? `${supplied.alias}/${supplied.sid ?? 's1'}` : '', TO: 'ALL', TYPE: 'NOTE'}, text: ''});
  const [principal, setPrincipal] = useState(supplied), [structured, setStructured] = useSessionDraft('composer.structured', false), [replacement, setReplacement] = useState<Draft|null>(null), [incoming, setIncoming] = useState<string|null>(null);
  const [errors, setErrors] = useState<string[]>([]), [reasons, setReasons] = useState<readonly ValidationReason[]>([]), [status, setStatus] = useState(''), [checking, setChecking] = useState(false), [checked, setChecked] = useState<Preflight|null>(null), [stale, setStale] = useState(false);
  const [deferred, setDeferred] = useSessionDraft('composer.deferred', ''), [aliases, setAliases] = useState<string[]>([]), [registryFailed, setRegistryFailed] = useState(false);
  const operation = useWriteOperation(), textarea = useRef<HTMLTextAreaElement>(null), lastRevision = useRef(revision), action = useRef(false);
  useEffect(() => {
    if (supplied !== undefined) {setPrincipal(supplied); if (supplied?.alias) setFields(current => current.fields.FROM ? current : {...current, fields: {...current.fields, FROM: `${supplied.alias}/${supplied.sid ?? 's1'}`}}); return;}
    const abort = new AbortController();
    void client.request<Principal>('/v1/auth/me', {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) {setPrincipal(data); setFields(current => ({...current, fields: {...current.fields, FROM: data.alias ? `${data.alias}/${data.sid ?? 's1'}` : ''}}));}}).catch(() => {});
    return () => abort.abort();
  }, [client, supplied]);
  useEffect(() => {const owner = /^\/v1\/repos\/([^/]+)\//.exec(path)?.[1]; if (!owner) return; const abort = new AbortController(); void allPages<{name: string; status: string}>(client, `/v1/owners/${owner}/aliases`, abort.signal).then(rows => {if (!abort.signal.aborted) {setAliases(rows.filter(row => row.status === 'active').map(row => row.name)); setRegistryFailed(false);}}).catch(() => {if (!abort.signal.aborted) setRegistryFailed(true);}); return () => abort.abort();}, [client, path]);
  useEffect(() => {if (draft && !operation.locked) {if (body && body !== draft.body) {setIncoming(draft.body); return;} setBody(draft.body); setFields(parseDraft(draft.body).draft); setErrors([]); setReasons([]); setStatus(''); setChecked(null); setStructured(false); textarea.current?.focus();}}, [draft]);
  useEffect(() => {if (lastRevision.current !== revision) {lastRevision.current = revision; if (checked) {setChecked(null); setStale(true);}}}, [revision, checked]);
  const raw = parseDraft(body), type = raw.draft.fields.TYPE ?? fields.fields.TYPE ?? 'NOTE', size = draftSize(body, board, deferred && ['DECISION','HANDOFF'].includes(type) ? {compactDeferredReason: deferred} : {});
  const effectiveType = fields.fields.TYPE ?? 'NOTE', required = requiredFields(effectiveType), locked = operation.locked || checking;
  const mapped = new Set(reasons.map(composerReasonField).filter((key): key is string => !!key));
  const typeFeedback = fieldFeedback(reasons, 'TYPE', 'composer-type');
  const firstErrorId = mapped.size ? [...mapped][0] === 'TYPE' ? 'composer-type' : [...mapped][0] === 'compactDeferredReason' ? 'composer-deferred' : `composer-field-${[...mapped][0]}` : 'comment-body';
  function edited(value: string) {setBody(value); setFields(value ? parseDraft(value).draft : {fields: {FROM: principal?.alias ? `${principal.alias}/${principal.sid ?? 's1'}` : '', TO: 'ALL', TYPE: 'NOTE'}, text: ''}); setErrors([]); setReasons([]); setStatus(''); setChecked(null); setStale(false);}
  function apply(next: Draft) {
    if (body && !raw.lossless) {setReplacement(next); return;}
    edited(serializeDraft(next));
  }
  function changeField(key: string, value: string) {
    const next = {...fields, fields: {...fields.fields, [key]: value}};
    if (key === 'TYPE') {
      if (!['REPORT','ACK','DECISION'].includes(value)) delete next.fields.STATE;
      if (['ALIAS','COMPACT'].includes(value)) next.fields.TO = 'ALL';
      if (principal?.alias) next.fields.FROM = `${principal.alias}/${principal.sid ?? 's1'}`;
    }
    setFields(next);
    if (structured) apply(next);
  }
  async function act(post: boolean) {
    if (action.current) return; action.current = true; setErrors([]); setReasons([]); setStatus('');
    try {
      const request = {body, ...(['DECISION','HANDOFF'].includes(type) && deferred ? {compactDeferredReason: deferred} : {})};
      if (post) {
        const result = await operation.run<{commentId: string}>(client, path + '/comments', {method: 'POST', body: request});
        setStatus(ko.posted(result.commentId)); setBody(''); setFields({fields: {FROM: principal?.alias ? `${principal.alias}/${principal.sid ?? 's1'}` : '', TO: 'ALL', TYPE: 'NOTE'}, text: ''}); setDeferred(''); setChecked(null); onPosted();
      } else {
        setChecking(true); const result = await client.request<Preflight>(path + '/preflight', {method: 'POST', body: {mode: 'comment', request}});
        if (result.data.context?.revision !== undefined && lastRevision.current !== undefined && result.data.context.revision !== lastRevision.current) {setStale(true); setChecked(null);}
        else {setChecked(result.data); setStale(false); setStatus(ko.valid);}
      }
    } catch (error) {setErrors(errorLines(error)); setReasons(errorReasons(error)); setChecked(null);}
    finally {action.current = false; setChecking(false);}
  }
  return <><form aria-label={ko.composer} aria-busy={operation.busy || checking} noValidate onSubmit={(event: FormEvent) => {event.preventDefault(); void act(true);}}>
    <h2>{ko.composer}</h2><p>{composerKo.dryRun}</p>{board && <p>{composerKo.boardHint}</p>}
    <label htmlFor="composer-type">{composerKo.type}</label><select id="composer-type" disabled={locked} aria-invalid={typeFeedback.invalid} aria-describedby={typeFeedback.describedBy ?? 'composer-type-hint'} value={effectiveType} onChange={event => {setStructured(true); const next: Draft = {...fields, fields: {...fields.fields, ...(principal?.alias ? {FROM: `${principal.alias}/${principal.sid ?? 's1'}`} : {}), TYPE: event.target.value}}; if (!['ACK','REPORT','DECISION'].includes(event.target.value)) delete next.fields.STATE; if (['ALIAS','COMPACT'].includes(event.target.value)) next.fields.TO = 'ALL'; apply(next);}}>
      {(board ? boardTypes : TYPES).map(value => <option key={value} value={value}>{value}</option>)}
    </select><FieldErrors feedback={typeFeedback}/><p id="composer-type-hint">{composerKo.hints[effectiveType as keyof typeof composerKo.hints]}</p>
    <button type="button" disabled={locked} aria-pressed={structured} onClick={() => {setStructured(value => !value); if (body) setFields(raw.draft);}}>{structured ? composerKo.raw : composerKo.structured}</button>
    <fieldset hidden={!structured && !mapped.size} disabled={locked} aria-describedby="composer-type-hint"><legend>{composerKo.fields}</legend>
      {fieldKeys.filter(key => key !== 'TYPE').map(key => <ComposerField key={key} field={key} value={fields.fields[key] ?? ''} reasons={reasons} required={required.includes(key)} readOnly={key === 'FROM' && principal?.kind !== 'bootstrap'} stateDisabled={!['REPORT','ACK','DECISION'].includes(effectiveType)} onChange={value => changeField(key, value)}/>)}
      <datalist id="composer-alias-candidates"><option value="ALL"/>{aliases.map(alias => <option key={alias} value={alias}/>)}</datalist><p>{registryFailed ? composerKo.registryFallback : composerKo.registry}</p><label htmlFor="composer-tail">{composerKo.text}</label><textarea id="composer-tail" value={fields.text} onChange={event => {const next = {...fields, text: event.target.value}; setFields(next); if (structured) apply(next);}}/>
      <button type="button" onClick={() => apply(fields)}>{composerKo.apply}</button>
    </fieldset>
    <label htmlFor="comment-body">{ko.commentBody}</label><textarea ref={textarea} id="comment-body" disabled={locked} value={body} onChange={event => edited(event.target.value)} aria-invalid={errors.length > 0} aria-describedby={errors.length ? 'composer-errors' : undefined}/>
    {['DECISION','HANDOFF'].includes(type) && <><label htmlFor="composer-deferred">{composerKo.deferred}</label><textarea id="composer-deferred" disabled={locked} value={deferred} aria-invalid={mapped.has('compactDeferredReason')} aria-describedby={mapped.has('compactDeferredReason') ? 'composer-deferred-help composer-errors' : 'composer-deferred-help'} onChange={event => {setDeferred(event.target.value); setChecked(null); setStatus(''); setErrors([]); setReasons([]);}}/><p id="composer-deferred-help">{composerKo.deferredHelp}</p></>}
    <section aria-label={composerKo.preview}><Envelope fields={header(body).values}/><pre>{body}</pre><p>{composerKo.count(size.chars, size.bytes, size.limit)}</p><p>{composerKo.metadata}</p><pre>{JSON.stringify(deferred && ['DECISION','HANDOFF'].includes(type) ? {compactDeferredReason: deferred} : {}, null, 2)}</pre></section>
    {errors.length > 0 && <><a href={`#${firstErrorId}`} onClick={event => {event.preventDefault(); document.getElementById(firstErrorId)?.focus();}}>{composerKo.firstError}</a><div role="alert" id="composer-errors">{errors.map((message, index) => <p key={index}>{message}</p>)}</div></>}
    {status && <p role="status">{status}</p>}{stale && <p role="status">{composerKo.stale}</p>}
    {checked && <section aria-label={composerKo.checked}><pre>{JSON.stringify(checked, null, 2)}</pre></section>}
    {type === 'COMPACT' && <p>{composerKo.compact} {compactHref && <a href={compactHref}>{composerKo.compactLink}</a>}</p>}
    <button type="button" disabled={locked} onClick={() => void act(false)}>{ko.validate}</button><button disabled={operation.busy || checking} type="submit">{operation.uncertain ? composerKo.retry : ko.post}</button>
    <OperationState operation={operation}/>
  </form><ConfirmDialog open={replacement !== null} name={composerKo.replace} onClose={() => setReplacement(null)}><h2>{composerKo.replace}</h2><p>{composerKo.replaceHint}</p><pre>{body}</pre><pre>{replacement ? serializeDraft(replacement) : ''}</pre><button onClick={() => {if (replacement) edited(serializeDraft(replacement)); setReplacement(null);}}>{composerKo.apply}</button><button onClick={() => setReplacement(null)}>{ko.cancel}</button></ConfirmDialog>
    <ConfirmDialog open={incoming !== null} name={composerKo.incoming} onClose={() => setIncoming(null)}><h2>{composerKo.incoming}</h2><p>{composerKo.incomingHint}</p><pre>{body}</pre><pre>{incoming}</pre><button onClick={() => {if (incoming !== null) edited(incoming); setIncoming(null);}}>{composerKo.apply}</button><button onClick={() => setIncoming(null)}>{ko.cancel}</button></ConfirmDialog></>;
}
