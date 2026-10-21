import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, errorReasons, ClientError, allPages, issuePath, repoPath, type IssueView, type Principal} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {useWriteOperation, OperationState, STATES, TimeAssist} from '../composer/index.js';
import {ko} from '../../resources/index.js';
import {issueKo} from '../../resources/issue.js';
import {composerKo} from '../../resources/composer.js';
import {bodyKeys, parseBodyDraft, bodyFromFields, initialBody, bodyEnvelope, type BodyDraft, type EditBase} from './model.js';
export {bodyKeys, parseBodyDraft, bodyFromFields, initialBody, bodyEnvelope, EditSession} from './model.js';

/** Create uses syntax validation; edit submits exact raw text with its acknowledged If-Match revision. */
export function IssueForm({client, repo, initial, principal}: {client: IssusClient; repo: string; initial?: IssueView; principal?: Principal|null}) {
  const editing = !!initial, number = initial?.issue.number;
  const [title, setTitle] = useState(initial?.issue.title ?? ''), [body, setBody] = useState(initial?.body ?? initialBody(principal?.alias ?? ''));
  const [fields, setFields] = useState<BodyDraft>(() => parseBodyDraft(body)), [base, setBase] = useState<EditBase|undefined>(initial ? {body: initial.body, revision: initial.revision, etag: `"${initial.revision}"`} : undefined), [latest, setLatest] = useState<EditBase|null>(null);
  const [errors, setErrors] = useState<string[]>([]), [invalidFields, setInvalidFields] = useState<string[]>([]), [status, setStatus] = useState(''), [checking, setChecking] = useState(false), [needsCheck, setNeedsCheck] = useState(false), [created, setCreated] = useState<number|null>(null), [check, setCheck] = useState<unknown>(null), [aliases, setAliases] = useState<string[]>([]), [registryFailed, setRegistryFailed] = useState(false);
  const operation = useWriteOperation(), path = number ? issuePath(repo, number) : `${repoPath(repo)}/issues`;
  useEffect(() => {if (!initial && principal?.alias) setBody(current => {const parsed = parseBodyDraft(current); if (parsed.fields.OWNER) return current; const next = initialBody(principal.alias!); setFields(parseBodyDraft(next)); return next;});}, [initial, principal]);
  useEffect(() => {if (editing) return; const abort = new AbortController(); void allPages<{name: string; status: string}>(client, `/v1/owners/${encodeURIComponent(repo.split('/')[0])}/aliases`, abort.signal).then(rows => {if (!abort.signal.aborted) {setAliases(rows.filter(row => row.status === 'active').map(row => row.name)); setRegistryFailed(false);}}).catch(() => {if (!abort.signal.aborted) setRegistryFailed(true);}); return () => abort.abort();}, [client, repo, editing]);
  function edit(value: string) {setBody(value); setFields(parseBodyDraft(value)); setErrors([]); setInvalidFields([]); setCheck(null); setStatus('');}
  async function act(save: boolean) {
    setErrors([]); setInvalidFields([]); setStatus('');
    try {
      if (!save) {
        setChecking(true);
        const response = await client.request(editing ? path + '/preflight' : '/v1/validate', {method: 'POST', ...(editing ? {revision: base!.revision} : {}), body: editing ? {mode: 'issue-body', request: {body}} : {mode: 'issue-body', body}});
        setCheck(response.data); setNeedsCheck(false); setStatus(ko.valid);
      } else if (editing) {
        const result = await operation.run<{revision: number}>(client, path + '/body', {method: 'PATCH', revision: base!.revision, body: {body}});
        setBase({body, revision: result.revision, etag: `"${result.revision}"`}); setLatest(null); setCheck(null); setStatus(issueKo.saved);
      } else {
        const result = await operation.run<{number: number}>(client, path, {method: 'POST', body: {title, body}});
        setCreated(result.number); setStatus(issueKo.created(result.number));
      }
    } catch (error) {
      setErrors(errorLines(error)); setInvalidFields(errorReasons(error).map(reason => reason.path));
      if (editing && error instanceof ClientError && error.status === 412) {
        try {const response = await client.request<IssueView>(path); setLatest({body: response.data.body, revision: response.data.revision, etag: response.headers.get('ETag') ?? `"${response.data.revision}"`});}
        catch (refreshError) {setErrors(lines => [...lines, ...errorLines(refreshError)]);}
      }
    } finally {setChecking(false);}
  }
  return <form aria-label={editing ? issueKo.edit : issueKo.create} aria-busy={operation.busy || checking} noValidate onSubmit={event => {event.preventDefault(); if (!latest && !needsCheck) void act(true);}}>
    <p>{editing ? issueKo.bodyHelp : issueKo.syntaxHint}</p><label htmlFor="issue-form-title">{issueKo.title}</label><input id="issue-form-title" readOnly={editing} disabled={operation.locked} value={title} onChange={event => setTitle(event.target.value)} required/>
    {base && <dl><div><dt>{issueKo.revision}</dt><dd>{base.revision}</dd></div><div><dt>{issueKo.etag}</dt><dd>{base.etag}</dd></div></dl>}
    <fieldset disabled={operation.locked || checking}><legend>{issueKo.fields}</legend>{bodyKeys.filter(key => editing || !['REPLY-IN','COMPACT'].includes(key)).map(key => <div key={key}>
      <label htmlFor={`issue-form-${key}`}>{key}</label>{key === 'STATE' ? <select id={`issue-form-${key}`} value={fields.fields[key] ?? ''} onChange={event => setFields({...fields, fields: {...fields.fields, [key]: event.target.value}})}>{STATES.map(state => <option key={state}>{state}</option>)}</select> :
        <input id={`issue-form-${key}`} value={fields.fields[key] ?? ''} list={key === 'OWNER' && !editing ? 'issue-owner-candidates' : undefined} readOnly={editing && ['OWNER','REPLY-IN','COMPACT'].includes(key)} aria-invalid={invalidFields.includes(`envelope.${key}`)} onChange={event => setFields({...fields, fields: {...fields.fields, [key]: event.target.value}})}/>}{key === 'UPDATED' && <TimeAssist field={key} id={`issue-form-${key}`} value={fields.fields[key] ?? ''} onChange={value => setFields({...fields, fields: {...fields.fields, [key]: value}})}/>}
    </div>)}{!editing && <><datalist id="issue-owner-candidates">{aliases.map(alias => <option key={alias} value={alias}/>)}</datalist><p>{registryFailed ? composerKo.registryFallback : composerKo.registry}</p></>}<p>{issueKo.ownerReadonly} {issueKo.pointerReadonly}</p><label htmlFor="issue-form-tail">{issueKo.tail}</label><textarea id="issue-form-tail" value={fields.text} onChange={event => setFields({...fields, text: event.target.value})}/><button type="button" onClick={() => edit(bodyFromFields(fields, base?.body))}>{issueKo.applyFields}</button></fieldset>
    <label htmlFor="issue-form-body">{issueKo.body}</label><textarea id="issue-form-body" disabled={operation.locked || checking} value={body} onChange={event => edit(event.target.value)} aria-invalid={errors.length > 0} aria-describedby={errors.length ? 'issue-form-errors' : undefined}/>
    <section aria-label={issueKo.preview}><Envelope fields={bodyEnvelope(body)}/><pre>{body}</pre></section>
    {base && <section aria-label={issueKo.compare}><h2>{issueKo.before}</h2><pre>{base.body}</pre><h2>{issueKo.draft}</h2><pre>{body}</pre></section>}
    {latest && <section aria-label={issueKo.latest}><p role="alert">{issueKo.conflict}</p><p>{issueKo.revision}: {latest.revision} · {issueKo.etag}: {latest.etag}</p><pre>{latest.body}</pre><p>{issueKo.mergeHint}</p><button type="button" onClick={() => {setBase(latest); setLatest(null); setNeedsCheck(true); setCheck(null); setErrors([]); setStatus('');}}>{issueKo.merge}</button></section>}
    {errors.length > 0 && <div id="issue-form-errors" role="alert">{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}
    {status && <p role="status">{status}</p>}{check != null && <pre>{JSON.stringify(check, null, 2)}</pre>}
    <button type="button" disabled={operation.locked || checking || !!latest} onClick={() => void act(false)}>{editing ? issueKo.contextCheck : issueKo.syntax}</button><button type="submit" disabled={operation.busy || checking || !!latest || needsCheck || !!created}>{operation.uncertain ? composerKo.retry : editing ? issueKo.save : issueKo.create}</button>
    {created && <a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${created}`}>{issueKo.openIssue}</a>}<OperationState operation={operation}/>
  </form>;
}
