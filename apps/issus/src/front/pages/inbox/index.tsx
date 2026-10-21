import {useEffect, useState} from 'react';
import {subscribe, type IssusClient} from 'issus_domain/front';
import type {InboxItem, InboxResponse} from 'issus_domain/common';
import {errorLines, readInbox, type Principal} from '../../entry/client/index.js';
import {browserSocket} from '../../entry/socket/index.js';
import {Delivery} from '../../features/delivery/index.js';
import {ko} from '../../resources/index.js';

/** Alias-owned inbox uses P7 merge/order semantics and a live WS wakeup with pull refresh. */
export function Inbox({client, principal}: {client: IssusClient; principal: Principal}) {
  const query = new URLSearchParams(location.search);
  const [repo, setRepo] = useState(query.get('repo') ?? ''), [numbers, setNumbers] = useState(query.get('issues') ?? '');
  const [scope, setScope] = useState({repo: query.get('repo') ?? '', numbers: query.get('issues') ?? ''});
  const [items, setItems] = useState<InboxItem[]|null>(null), [response, setResponse] = useState<InboxResponse|null>(null), [errors, setErrors] = useState<string[]>([]), [version, setVersion] = useState(0), [stream, setStream] = useState<string>('');
  const refresh = () => setVersion(value => value + 1);
  useEffect(() => {const timer = setInterval(refresh, 5000); return () => clearInterval(timer);}, []);
  useEffect(() => {
    if (!scope.repo) return;
    const abort = new AbortController(), q = new URLSearchParams({repo: scope.repo, sinceCompact: 'true'});
    if (scope.numbers) q.set('issues', scope.numbers);
    void readInbox(client, '/v1/inbox?' + q, abort.signal).then(({model, response: page}) => {if (!abort.signal.aborted) {setItems([...model.items.values()]); setResponse(page); setErrors([]);}}).catch(error => {if (!abort.signal.aborted) setErrors(errorLines(error));});
    return () => abort.abort();
  }, [client, scope, version]);
  useEffect(() => {
    if (!scope.repo) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>|undefined;
    setStream(ko.streamConnecting);
    void subscribe(client, {transport: 'ws', socket: browserSocket, signal: abort.signal, request: {channels: [], repo: scope.repo, issues: scope.numbers.split(',').filter(Boolean).map(Number), from: 'since-compact'},
      key: () => crypto.randomUUID(), save: checkpoint => {if (checkpoint.closed && !abort.signal.aborted) setStream(ko.streamRetry);}, onFrame: frame => {
        if (frame.type === 'subscribed') setStream(ko.streamConnected);
        if (frame.type === 'event') {clearTimeout(timer); timer = setTimeout(refresh, 150);}
        if (frame.type === 'error') setStream(ko.streamRetry);
      }, maxReconnects: 4,
    }).catch(() => {if (!abort.signal.aborted) setStream(ko.streamFailed);});
    return () => {abort.abort(); clearTimeout(timer);};
  }, [client, scope]);
  const priority = {ME: 0, CC: 1, ALL: 2, OTHER: 3};
  const sorted = items ? [...items].sort((a, b) => priority[a.priority] - priority[b.priority] || a.viewKey.localeCompare(b.viewKey)) : [];
  return <><h1>{ko.inbox}</h1><p>{ko.alias}: {principal.alias}</p>
    <form aria-label={ko.inbox} onSubmit={event => {event.preventDefault(); setItems(null); setErrors([]); setScope({repo, numbers}); const q = new URLSearchParams({repo, issues: numbers}); history.replaceState(null, '', '/inbox?' + q);}}>
      <label htmlFor="inbox-repo">{ko.repo}</label><input id="inbox-repo" value={repo} onChange={event => setRepo(event.target.value)} required pattern="[^/]+/[^/]+"/>
      <label htmlFor="inbox-issues">{ko.issueNumbers}</label><input id="inbox-issues" value={numbers} onChange={event => setNumbers(event.target.value)} pattern="[0-9]+(,[0-9]+)*"/>
      <button type="submit">{ko.applyFilter}</button><button type="button" onClick={refresh}>{ko.refresh}</button>
    </form>
    {stream && <p role={stream === ko.streamFailed ? 'alert' : 'status'} aria-label={ko.streamStatus}>{stream}</p>}
    <section aria-label={ko.inbox}>
      {errors.length > 0 && <div role="alert">{errors.join('\n')}</div>}
      {scope.repo && items === null && errors.length === 0 && <p role="status" aria-busy="true">{ko.loading}</p>}
      {response && <><p>{ko.pending}: {response.windowPendingAck.join(', ') || '0'}</p><p>{ko.globalPending}: {response.globalPendingAck.join(', ') || '0'}</p></>}
      {items?.length === 0 && <p role="status">{ko.empty}</p>}
      <ol aria-label={ko.inbox}>{sorted.map(item => <Delivery key={item.viewKey} item={item} client={client} principal={principal} repo={scope.repo} onChanged={refresh}/>)}</ol>
    </section>
  </>;
}
