import {useEffect, useMemo, useState} from 'react';
import {ClientError, connectBrowser, createBrowserClient, errorLines, type Principal} from '../client/index.js';
import {Repos} from '../../pages/repos/index.js';
import {Issues} from '../../pages/issues/index.js';
import {Issue} from '../../pages/issue/index.js';
import {Inbox} from '../../pages/inbox/index.js';
import {ko} from '../../resources/index.js';

/** Same-origin route shell; native links preserve browser navigation semantics. */
export function App() {
  const client = useMemo(() => createBrowserClient(), []);
  const [principal, setPrincipal] = useState<Principal|null>(null), [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [token, setToken] = useState(''), [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void client.request<Principal>('/v1/auth/me', {signal: abort.signal}).then(({data}) => {setPrincipal(data);}).catch(error => {if (!abort.signal.aborted) {setPrincipal(null); if (!(error instanceof ClientError && error.status === 401)) setErrors(errorLines(error));}}).finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [client, version]);
  async function connect() {
    setBusy(true); setErrors([]); setStatus('');
    try {await connectBrowser(token); setToken(''); setStatus(ko.connected); setVersion(value => value + 1);}
    catch (error) {setErrors(errorLines(error));} finally {setBusy(false);}
  }
  let view;
  const route = /^\/repos\/([^/]+)\/([^/]+)\/issues(?:\/([1-9]\d*))?\/?$/.exec(location.pathname);
  if (loading) view = <><h1>{ko.app}</h1><p role="status" aria-busy="true">{ko.loading}</p></>;
  else if (!principal) view = <><h1>{ko.connection}</h1><p role="status">{ko.authRequired}</p></>;
  else if (location.pathname === '/inbox') view = <Inbox client={client} principal={principal}/>;
  else if (route) {
    const repo = `${decodeURIComponent(route[1])}/${decodeURIComponent(route[2])}`;
    view = route[3] ? <Issue client={client} repo={repo} number={Number(route[3])}/> : <Issues client={client} repo={repo}/>;
  } else if (['/', '/repos'].includes(location.pathname)) view = <Repos client={client}/>;
  else view = <><h1>{ko.notFound}</h1><p role="alert">{ko.notFound}</p></>;
  return <><header className="topbar"><a href="/repos">{ko.app}</a><nav aria-label={ko.navigation}><a href="/repos">{ko.repos}</a><a href="/inbox">{ko.inbox}</a></nav>
    <details open={!principal && !loading}><summary>{ko.connection}</summary><form aria-label={ko.connection} aria-busy={busy} onSubmit={event => {event.preventDefault(); void connect();}}>
      <label htmlFor="session-token">{ko.token}</label><input id="session-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required/>
      <button type="submit" disabled={busy}>{ko.connect}</button>{errors.length > 0 && <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>}{status && <p role="status">{status}</p>}
    </form></details>
  </header><main key={version}>{view}</main></>;
}
