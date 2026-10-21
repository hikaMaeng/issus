import {useEffect, useMemo, useState} from 'react';
import {ClientError, createBrowserClient, errorLines, hasBrowserCsrf, type Principal} from '../client/index.js';
import {Repos} from '../../pages/repos/index.js';
import {Issues} from '../../pages/issues/index.js';
import {Issue} from '../../pages/issue/index.js';
import {Inbox} from '../../pages/inbox/index.js';
import {Login} from '../../pages/login/index.js';
import {Sessions} from '../../pages/sessions/index.js';
import {Roster} from '../../pages/roster/index.js';
import {AppShell, IssueContext} from '../../features/app-shell/index.js';
import {ConnectionForm, safeReturnPath} from '../../features/session/index.js';
import {Feedback} from '../../features/feedback/index.js';
import {ko, feedbackKo} from '../../resources/index.js';

/** Same-origin route shell; native links preserve browser navigation semantics. */
export function App() {
  const client = useMemo(() => createBrowserClient(), []);
  const [principal, setPrincipal] = useState<Principal|null>(null), [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    const abort = new AbortController();
    const invalidate = () => {sessionStorage.removeItem('issus.csrf'); setPrincipal(null); setLoading(false);};
    async function recover() {
      try {const {data} = await client.request<Principal>('/v1/auth/me', {signal: abort.signal}); if (!abort.signal.aborted) {setPrincipal(current => current?.sessionId === data.sessionId ? current : data); setErrors([]);}}
      catch (error) {if (!abort.signal.aborted) {if (error instanceof ClientError && error.status === 401) invalidate(); else setErrors(errorLines(error));}}
      finally {if (!abort.signal.aborted) setLoading(false);}
    }
    void recover(); window.addEventListener('issus:unauthenticated', invalidate); window.addEventListener('focus', recover);
    const timer = setInterval(() => void recover(), 30000);
    return () => {abort.abort(); clearInterval(timer); window.removeEventListener('issus:unauthenticated', invalidate); window.removeEventListener('focus', recover);};
  }, [client]);
  useEffect(() => {
    if (!principal?.expiresAt) return;
    const timer = setTimeout(() => {setPrincipal(null); sessionStorage.removeItem('issus.csrf');}, Math.max(0, new Date(principal.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [principal]);
  function connected(value: Principal) {
    setPrincipal(value); setLoading(false); setErrors([]); setVersion(count => count + 1);
    if (location.pathname === '/login') location.replace(safeReturnPath(new URLSearchParams(location.search).get('returnTo'), location.origin));
  }
  let view;
  const route = /^\/repos\/([^/]+)\/([^/]+)(?:\/issues(?:\/([1-9]\d*|new)(?:\/(edit|compact))?)?|\/(board))?\/?$/.exec(location.pathname);
  const repo = route ? `${decodeURIComponent(route[1])}/${decodeURIComponent(route[2])}` : new URLSearchParams(location.search).get('repo') ?? undefined;
  if (loading) view = <><h1>{ko.app}</h1><Feedback loading/></>;
  else if (location.pathname === '/sessions') view = <Sessions client={client} principal={principal} onConnected={connected}/>;
  else if (!principal || location.pathname === '/login') view = <Login/>;
  else if (location.pathname === '/inbox') view = <Inbox client={client} principal={principal}/>;
  else if (/^\/owners\/[^/]+\/aliases\/?$/.test(location.pathname)) view = <Roster client={client} principal={principal} owner={decodeURIComponent(location.pathname.split('/')[2])}/>;
  else if (route && repo) {
    if (route[5] || route[3] === 'new' || route[4]) view = <><h1>{route[5] ? feedbackKo.board : route[3] === 'new' ? feedbackKo.newIssue : ko.issues}</h1><p role="status">{feedbackKo.unavailable}</p></>;
    else view = route[3] ? <Issue client={client} repo={repo} number={Number(route[3])}/> : <Issues client={client} repo={repo}/>;
  } else if (['/', '/repos'].includes(location.pathname)) view = <Repos client={client}/>;
  else view = <><h1>{ko.notFound}</h1><p role="alert">{ko.notFound}</p></>;
  return <AppShell principal={principal} repo={repo} aside={principal && route?.[3] && /^[1-9]\d*$/.test(route[3]) && repo ? <IssueContext client={client} repo={repo} number={Number(route[3])}/> : undefined} session={<details key={principal?.sessionId ?? 'anonymous'} open={!principal && !loading}><summary role="button">{ko.connection}</summary><ConnectionForm onConnected={connected}/></details>}>
    <Feedback errors={errors}/>{principal && !hasBrowserCsrf() && <p role="status">{ko.csrfMissing}</p>}<div key={`${principal?.sessionId ?? 'anonymous'}:${version}`}>{view}</div>
  </AppShell>;
}
