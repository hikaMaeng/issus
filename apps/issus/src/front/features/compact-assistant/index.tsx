import {useEffect, useRef, useState} from 'react';
import {useSessionDraft} from '../session/index.js';
import type {CompactPacket, CompactPurpose, CompactStatus} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {ClientError, errorLines, errorReasons, issuePath, repoPath, type CommentView, type IssueView, type Principal} from '../../entry/client/index.js';
import {DeliveryWrite} from '../delivery/index.js';
import {ko} from '../../resources/index.js';
import {compactKo} from '../../resources/compact.js';
import {inboxKo} from '../../resources/inbox.js';
import {compactDraft, compactPreview, compactRequest, packetDownload, packetSamples} from './model.js';
export {compactDraft, compactPreview, compactRequest, packetDownload, packetSamples} from './model.js';

/** Human-authored summaries bind raw body and sample evidence to one in-memory packet. */
export function CompactAssistant({client,repo,number}: {client:IssusClient;repo:string;number:number}) {
  const path=issuePath(repo,number);
  const [status,setStatus]=useState<CompactStatus|null>(null), [packet,setPacket]=useState<CompactPacket|null>(null), [purpose,setPurpose]=useSessionDraft<CompactPurpose>('compact.purpose','routine');
  const [principal,setPrincipal]=useState<Principal|null>(null), [body,setBody]=useSessionDraft('compact.body',''), [author,setAuthor]=useSessionDraft('compact.author',''), [samples,setSamples]=useState<string[]>([]), [opened,setOpened]=useState<string[]>([]);
  const [errors,setErrors]=useState<string[]>([]), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [empty,setEmpty]=useState(false), [stale,setStale]=useState(false), [changed,setChanged]=useState(false);
  const [invalid,setInvalid]=useState<string[]>([]);
  const [operation,setOperation]=useState<string|null>(null), [source,setSource]=useState<CommentView|null>(null), [sourceErrors,setSourceErrors]=useState<string[]>([]), [sourceLoading,setSourceLoading]=useState(false);
  const [previousReview,setPreviousReview]=useSessionDraft<string[]>('compact.previousReview',[]), [checked,setChecked]=useState(false);
  const rawDialog=useRef<HTMLDialogElement>(null),writer=useRef(new DeliveryWrite()),currentPacket=useRef<CompactPacket|null>(null), sourceSequence=useRef(0);
  const [uncertain,setUncertain]=useState(false);
  const statusSequence=useRef(0);
  const pendingRetry=useRef<(()=>Promise<void>)|null>(null), published=useRef<{signature:string;commentId:string}|null>(null);
  const fingerprint=JSON.stringify([body,packet?.packetHash,samples,author]);
  useEffect(()=>setChecked(false),[fingerprint]);
  useEffect(()=>{if(samples.length)setPreviousReview(previous=>[...new Set([...previous,...samples])]);},[samples,setPreviousReview]);
  useEffect(()=>{
    const abort=new AbortController();
    void client.request<Principal>('/v1/auth/me',{signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted){setPrincipal(data);setAuthor(current=>current||data.alias||'');}}).catch(()=>{});
    async function refresh() {const sequence=++statusSequence.current;try {
      const [{data:next},{data:issue}]=await Promise.all([client.request<CompactStatus>(path+'/compact/status',{signal:abort.signal}),client.request<IssueView>(path,{signal:abort.signal})]);
      if(!abort.signal.aborted&&sequence===statusSequence.current){setStatus(next);const active=currentPacket.current;if(active&&(next.previousCompactId!==active.previousCompactId||next.count!==active.count||next.chars!==active.chars||issue.revision!==active.snapshotRevision)){setChanged(true);setChecked(false);}}
    }catch(error){if(!abort.signal.aborted&&sequence===statusSequence.current)setErrors(errorLines(error));}}
    void refresh();const timer=setInterval(()=>void refresh(),5000);window.addEventListener('focus',refresh);
    return ()=>{abort.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[client,path]);
  function acceptPacket(next:CompactPacket|undefined) {
    statusSequence.current++;
    setEmpty(!next);setStale(false);setChanged(false);setChecked(false);setMessage('');
    if(!next){setPacket(null);currentPacket.current=null;return;}
    if(currentPacket.current){setPreviousReview(previous=>[...new Set([...previous,...samples])]);if(!samples.length&&!previousReview.length)setMessage(compactKo.draftKept);}
    setPacket(next);currentPacket.current=next;setSamples([]);setOpened([]);
    setBody(previous=>previous||compactDraft(next,number,author||principal?.alias,principal?.sid));
    const prepared=next as CompactPacket&{status?:CompactStatus};if(prepared.status)setStatus(prepared.status);
  }
  async function write<T>(target:string,payload:unknown):Promise<T> {
    try{return await writer.current.run<T>(client,target,payload,setOperation);}
    finally{setUncertain(!!writer.current.pending);if(!writer.current.pending)setOperation(null);}
  }
  async function run(action:()=>Promise<void>) {pendingRetry.current=action;setBusy(true);setErrors([]);setInvalid([]);setMessage('');try{await action();}catch(error){setErrors(errorLines(error));setInvalid(errorReasons(error).map(reason=>reason.path));setChecked(false);if(error instanceof ClientError&&[409,410].includes(error.status)&&['COMPACT_STALE','COMPACT_PACKET_EXPIRED'].includes(error.code))setStale(true);}finally{setBusy(false);}}
  async function prepare() {await run(async()=>acceptPacket(await write<CompactPacket|undefined>(path+'/compact/prepare',{purpose})));}
  async function existing() {await run(async()=>{const result=await client.request<CompactPacket>(path+'/compact/packet?format=json');acceptPacket(result.status===204?undefined:result.data);});}
  function download() {
    if(!packet)return;const file=packetDownload(packet,repo,number), url=URL.createObjectURL(new Blob([file.markdown],{type:'text/markdown;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=file.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  async function raw(id:string) {
    const sequence=++sourceSequence.current;setSource(null);setSourceErrors([]);setSourceLoading(true);rawDialog.current?.showModal();
    try{const {data}=await client.request<CommentView>(repoPath(repo)+'/comments/'+encodeURIComponent(id));if(sequence===sourceSequence.current){setSource(data);setOpened(previous=>[...new Set([...previous,id])]);}}
    catch(error){if(sequence===sourceSequence.current)setSourceErrors(errorLines(error));}finally{if(sequence===sourceSequence.current)setSourceLoading(false);}
  }
  const minimum=packet?Math.min(3,packet.comments.length):0, selected=packet?packetSamples(packet,samples):[], ready=!!packet&&!!body&&!!author&&selected.length>=minimum;
  const invalidBody=invalid.some(path=>path==='body'||path.startsWith('envelope.'));
  async function validate() {if(!packet)return;await run(async()=>{await client.request(path+'/preflight',{method:'POST',body:{mode:'comment',request:compactRequest(body,packet,selected,author)}});setChecked(true);});}
  async function post() {if(!packet)return;await run(async()=>{
    const request=compactRequest(body,packet,selected,author),signature=JSON.stringify(request);
    const result=published.current?.signature===signature?published.current:await write<{commentId:string}>(path+'/comments',request);
    published.current={signature,commentId:result.commentId};
    const {data:issue}=await client.request<IssueView>(path);
    if(issue.envelope.COMPACT!==result.commentId){setMessage(compactKo.notConfirmed);return;}
    setMessage(compactKo.confirmed(result.commentId,issue.revision));setPacket(null);currentPacket.current=null;published.current=null;setBody('');setSamples([]);setOpened([]);setStale(false);setChanged(false);setChecked(false);
    const sequence=++statusSequence.current,next=(await client.request<CompactStatus>(path+'/compact/status')).data;if(sequence===statusSequence.current)setStatus(next);
  });}
  return <section aria-label={compactKo.title}>
    <section aria-label={compactKo.status}><h2>{compactKo.status}</h2>
      {!status&&errors.length===0&&<p role="status" aria-busy="true">{ko.loading}</p>}
      {status&&<><p role="status">{status.due?compactKo.due:compactKo.notDue}</p><dl><dt>{compactKo.previous}</dt><dd>{status.previousCompactId??inboxKo.none}</dd><dt>{compactKo.count}</dt><dd>{status.count}</dd><dt>{compactKo.chars}</dt><dd>{status.chars}</dd><dt>{ko.owner}</dt><dd>{status.owner}</dd><dt>{compactKo.reasons}</dt><dd>{status.reasons.join(', ')||inboxKo.none}</dd></dl></>}
      <p>{compactKo.thresholds}</p>
    </section>
    {errors.length>0&&<div role="alert" id="compact-errors">{errors.map((line,index)=><p key={index}>{line}</p>)}</div>}
    {stale&&<p role="alert">{compactKo.stale}</p>}{changed&&<p role="status">{compactKo.changed}</p>}{message&&<p role="status">{message}</p>}
    {(operation||uncertain)&&<section aria-label={inboxKo.operation}><p role="status">{inboxKo.operationPending}{operation?`: ${operation}`:''}</p><button type="button" disabled={busy} onClick={()=>{if(pendingRetry.current)void run(pendingRetry.current);}}>{inboxKo.retry}</button></section>}
    <fieldset disabled={busy||uncertain||!!operation}><label htmlFor="compact-purpose">{compactKo.purpose}</label><select id="compact-purpose" value={purpose} onChange={event=>setPurpose(event.target.value as CompactPurpose)}>{Object.entries(compactKo.purposes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <button type="button" disabled={busy} onClick={()=>void prepare()}>{compactKo.prepare}</button><button type="button" disabled={busy} onClick={()=>void existing()}>{compactKo.existing}</button><button type="button" disabled={!packet||busy} onClick={download}>{compactKo.download}</button>
    {empty&&<p role="status">{compactKo.empty}</p>}
    {previousReview.length>0&&<p>{compactKo.draftKept} {previousReview.join(', ')}</p>}
    {packet&&<section aria-label={compactKo.packet}><h2>{compactKo.packet}</h2><p>{compactKo.packetHelp}</p>
      <dl><dt>{compactKo.through}</dt><dd>{packet.throughId}</dd><dt>{compactKo.revision}</dt><dd>{packet.snapshotRevision}</dd><dt>{compactKo.hash}</dt><dd>{packet.packetHash}</dd><dt>{compactKo.masked}</dt><dd>{packet.maskedCount}</dd></dl><pre>{packet.markdown}</pre>
      <details><summary role="button">{compactKo.appendix}</summary><pre>{JSON.stringify(packet.pendingAppendix,null,2)}</pre></details>
      <details><summary role="button">{compactKo.controls}</summary><pre>{JSON.stringify(packet.controlFactsSinceCompact,null,2)}</pre></details>
      <fieldset aria-invalid={invalid.includes('sampledIds')||undefined} aria-describedby={invalid.includes('sampledIds')?'compact-errors':undefined}><legend>{compactKo.samples}</legend><p id="compact-samples-help">{compactKo.required(minimum)}</p>{packet.comments.map(comment=><div key={comment.id}><button type="button" onClick={()=>void raw(comment.id)}>{compactKo.rawOpen(comment.id)}</button><label htmlFor={`sample-${comment.id}`}><input id={`sample-${comment.id}`} type="checkbox" checked={selected.includes(comment.id)} disabled={!opened.includes(comment.id)} aria-describedby="compact-samples-help" onChange={event=>setSamples(previous=>event.target.checked?[...previous,comment.id]:previous.filter(id=>id!==comment.id))}/>{compactKo.sample(comment.id)}</label></div>)}</fieldset>
    </section>}
    <form aria-label={compactKo.title} onSubmit={event=>{event.preventDefault();void post();}}>
      <p>{compactKo.manual}</p><label htmlFor="compact-author">{compactKo.author}</label><input id="compact-author" value={author} onChange={event=>setAuthor(event.target.value)} aria-invalid={invalid.includes('compactedBy')||undefined} aria-describedby={invalid.includes('compactedBy')?'compact-errors':undefined} required/>
      <label htmlFor="compact-body">{compactKo.body}</label><textarea id="compact-body" value={body} onChange={event=>setBody(event.target.value)} aria-invalid={invalidBody||undefined} aria-describedby={invalidBody?'compact-errors':undefined} required/>
      {packet&&<section aria-label={compactKo.preview}><h2>{compactKo.preview}</h2><pre>{JSON.stringify(compactPreview(body,packet,selected,author,compactKo.tokenMasked),null,2)}</pre></section>}
      {!ready&&<p>{compactKo.reviewRequired}</p>}<button type="button" disabled={busy||!ready} onClick={()=>void validate()}>{compactKo.validate}</button><button type="submit" disabled={busy||!ready}>{compactKo.post}</button>{checked&&<p role="status">{compactKo.checked}</p>}
    </form></fieldset>
    <dialog ref={rawDialog} aria-label={source?compactKo.raw(source.id):compactKo.samples} onCancel={()=>{sourceSequence.current++;}}>
      <h2>{source?compactKo.raw(source.id):compactKo.samples}</h2>{sourceLoading&&<p role="status" aria-busy="true">{ko.loading}</p>}{sourceErrors.length>0&&<div role="alert">{sourceErrors.map((line,index)=><p key={index}>{line}</p>)}</div>}{source&&<pre>{source.body}</pre>}
      <button type="button" onClick={()=>{sourceSequence.current++;rawDialog.current?.close();}}>{compactKo.closeRaw}</button>
    </dialog>
  </section>;
}
