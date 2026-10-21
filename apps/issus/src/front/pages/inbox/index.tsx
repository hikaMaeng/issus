import {useEffect, useRef, useState} from 'react';
import {subscribe, type IssusClient} from 'issus_domain/front';
import type {InboxItem, InboxResponse} from 'issus_domain/common';
import {errorLines, readInbox, type Principal} from '../../entry/client/index.js';
import {browserSocket, browserStreamClient} from '../../entry/socket/index.js';
import {Delivery, issueNumbers, mergeInboxSnapshot, orderDeliveries} from '../../features/delivery/index.js';
import {ReferenceLink} from '../../features/reference/index.js';
import {ko} from '../../resources/index.js';
import {inboxKo} from '../../resources/inbox.js';

/** Alias-owned scope auto-subscribes at the fixed WS URL; polling supplements event invalidation. */
export function Inbox({client, principal}: {client: IssusClient; principal: Principal}) {
  const query = new URLSearchParams(location.search);
  const [repo,setRepo] = useState(query.get('repo')??''), [numbers,setNumbers] = useState(query.get('issues')??''), [board,setBoard] = useState(query.getAll('board').join(','));
  const [since,setSince] = useState(query.get('sinceCompact')!=='false'), [transport,setTransport] = useState<'ws'|'sse'>(query.get('transport')==='sse'?'sse':'ws');
  const [scope,setScope] = useState({repo,numbers,board,since,transport});
  const [items,setItems] = useState<InboxItem[]|null>(null), [response,setResponse] = useState<InboxResponse|null>(null), [errors,setErrors] = useState<string[]>([]);
  const [version,setVersion] = useState(0), [stream,setStream] = useState(''), [now,setNow] = useState(Date.now()), [updated,setUpdated] = useState(''), [refreshing,setRefreshing] = useState(false);
  const acceptedE = useRef<bigint>(-1n);
  const refresh = () => setVersion(value=>value+1);
  useEffect(()=>{const timer=setInterval(refresh,5000), clock=setInterval(()=>setNow(Date.now()),1000); window.addEventListener('focus',refresh); return ()=>{clearInterval(timer);clearInterval(clock);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>{setItems(null);setResponse(null);setUpdated('');acceptedE.current=-1n;},[client,scope]);
  useEffect(()=>{
    if(!scope.repo) return;
    const abort=new AbortController(), q=new URLSearchParams({repo:scope.repo,sinceCompact:String(scope.since)});
    if(scope.numbers) q.set('issues',scope.numbers); for(const number of issueNumbers(scope.board)) q.append('board',String(number));
    setRefreshing(true);
    void readInbox(client,'/v1/inbox?'+q,abort.signal).then(({model,response:page})=>{
      if(abort.signal.aborted) return;
      const e=BigInt(page.bootstrap.inboxThroughEventSequence); if(e<acceptedE.current) return; acceptedE.current=e;
      setItems(previous=>mergeInboxSnapshot(previous??[],[...model.items.values()]));setResponse(page);setErrors([]);setUpdated(new Date().toISOString());
    }).catch(error=>{if(!abort.signal.aborted)setErrors(errorLines(error));}).finally(()=>{if(!abort.signal.aborted)setRefreshing(false);});
    return ()=>abort.abort();
  },[client,scope,version]);
  useEffect(()=>{
    if(!scope.repo)return;
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;setStream(ko.streamConnecting);
    void subscribe(browserStreamClient(client,scope.transport),{transport:scope.transport,socket:browserSocket,signal:abort.signal,request:{channels:[],repo:scope.repo,issues:[...new Set([...issueNumbers(scope.numbers),...issueNumbers(scope.board)])],from:scope.since?'since-compact':'start'},
      key:()=>crypto.randomUUID(),save:checkpoint=>{if(checkpoint.closed&&!abort.signal.aborted)setStream(ko.streamRetry);},onSubscription:()=>refresh(),onFrame:frame=>{
        if(frame.type==='subscribed')setStream(ko.streamConnected);
        if(frame.type==='event'){clearTimeout(timer);timer=setTimeout(refresh,150);}
        if(frame.type==='error')setStream(ko.streamRetry);
      },maxReconnects:4,
    }).catch(()=>{if(!abort.signal.aborted)setStream(ko.streamFailed);});
    return ()=>{abort.abort();clearTimeout(timer);};
  },[client,scope]);
  const sorted=items&&response?orderDeliveries(items,response):[];
  function links(ids:readonly string[]) {return ids.length?<ul>{[...new Set(ids)].map(id=><li key={id}><ReferenceLink client={client} repo={scope.repo} id={id}/></li>)}</ul>:<p>{inboxKo.none}</p>;}
  return <><h1>{ko.inbox}</h1><p>{ko.alias}: {principal.alias}</p>
    <form aria-label={ko.inbox} onSubmit={event=>{event.preventDefault();setErrors([]);setScope({repo,numbers,board,since,transport});const q=new URLSearchParams({repo,issues:numbers,sinceCompact:String(since),transport});for(const n of issueNumbers(board))q.append('board',String(n));history.replaceState(null,'','/inbox?'+q);}}>
      <label htmlFor="inbox-repo">{ko.repo}</label><input id="inbox-repo" value={repo} onChange={event=>setRepo(event.target.value)} required pattern="[^/]+/[^/]+"/>
      <label htmlFor="inbox-issues">{ko.issueNumbers}</label><input id="inbox-issues" value={numbers} onChange={event=>setNumbers(event.target.value)} pattern="[0-9]+(,[0-9]+)*"/>
      <label htmlFor="inbox-board">{inboxKo.board}</label><input id="inbox-board" value={board} onChange={event=>setBoard(event.target.value)} pattern="[0-9]+(,[0-9]+)*"/>
      <label htmlFor="inbox-since"><input id="inbox-since" type="checkbox" checked={since} onChange={event=>setSince(event.target.checked)}/>{inboxKo.since}</label>
      <label htmlFor="inbox-transport">{inboxKo.transport}</label><select id="inbox-transport" value={transport} onChange={event=>setTransport(event.target.value as 'ws'|'sse')}><option value="ws">{inboxKo.ws}</option><option value="sse">{inboxKo.sse}</option></select>
      <button type="submit">{ko.applyFilter}</button><button type="button" onClick={refresh}>{ko.refresh}</button>
    </form>
    {stream&&<><p role={stream===ko.streamFailed?'alert':'status'} aria-label={ko.streamStatus}>{stream}</p><p>{inboxKo.transport}: {scope.transport==='ws'?inboxKo.ws:inboxKo.sse}</p></>}
    <section aria-label={ko.inbox}>
      {errors.length>0&&<div role="alert">{errors.map((message,index)=><p key={index}>{message}</p>)}</div>}
      {!scope.repo&&<p role="status">{inboxKo.scopeRequired}</p>}
      {scope.repo&&items===null&&errors.length===0&&<p role="status" aria-busy="true">{ko.loading}</p>}
      {items!==null&&refreshing&&<p role="status">{inboxKo.refreshing}</p>}
      {updated&&<p>{inboxKo.updated}: <time dateTime={updated}>{updated}</time></p>}
      {response&&<section aria-label={inboxKo.obligations}>
        {response.activeHolds.length>0&&<div role="alert"><h2>{inboxKo.holds}</h2>{links(response.activeHolds)}</div>}
        <h2>{inboxKo.window}</h2>{links(response.windowPendingAck)}<h2>{inboxKo.global}</h2>{links(response.globalPendingAck)}
        <h2>{inboxKo.waiting}</h2>{links(response.ackState.filter(state=>state.state==='waiting').map(state=>state.directiveId))}<p>{inboxKo.legacyHelp}</p>
      </section>}
      <p>{inboxKo.meaning}</p><p>{inboxKo.timing}</p>
      {items?.length===0&&<p role="status">{ko.empty}</p>}
      <ol aria-label={ko.inbox}>{sorted.map(item=><Delivery key={item.viewKey} item={item} client={client} principal={principal} repo={scope.repo} now={now} activeHold={!!item.commentId&&!!response?.activeHolds.includes(item.commentId)} onChanged={refresh}/>)}</ol>
    </section>
  </>;
}
