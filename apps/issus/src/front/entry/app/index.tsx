import {useEffect, useMemo, useRef, useState} from 'react';
import {ClientError, createBrowserClient, errorLines, hasBrowserCsrf, type Principal} from '../client/index.js';
import {AppShell, IssueContext} from '../../features/app-shell/index.js';
import {ConnectionForm, safeReturnPath, DraftRecovery, SessionDraftMemory, SessionDraftProvider, sessionDraftScope} from '../../features/session/index.js';
import {Feedback} from '../../features/feedback/index.js';
import {ko, sessionKo} from '../../resources/index.js';
import {resolveAppRoute} from './routes.js';
import {appRouteView} from './view.js';

/** The form exists during recovery and after login; the authenticated disclosure starts closed. */
export function SessionConnection({principal, loading, onConnected}: {principal: Principal|null; loading: boolean; onConnected: (value: Principal) => void}) {
  return <details key={principal?.sessionId ?? 'anonymous'} open={!principal && !loading}><summary role="button">{ko.connection}</summary><ConnectionForm onConnected={onConnected}/></details>;
}

/** Same-origin route shell; native links preserve browser navigation semantics. */
export function App() {
  const client = useMemo(() => createBrowserClient(), []);
  const drafts = useMemo(() => new SessionDraftMemory(), []), identity = useRef<Principal|null>(null), scope = useRef<string|null>(null), authGeneration = useRef(0);
  const [principal, setPrincipal] = useState<Principal|null>(null), [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [errors, setErrors] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const pagePath = location.pathname + location.search;
  function authenticated(value: Principal, force = false) {
    const nextScope = sessionDraftScope(value, pagePath);
    if (force || identity.current?.sessionId !== value.sessionId || scope.current !== nextScope) {
      drafts.suspend(scope.current); drafts.begin(nextScope); setVersion(count => count + 1);
    }
    identity.current = value; scope.current = nextScope; setPrincipal(value); setLoading(false); setErrors([]); setDraftMessage('');
  }
  function invalidate() {
    authGeneration.current++; drafts.suspend(scope.current); identity.current = null; scope.current = null;
    sessionStorage.removeItem('issus.csrf'); setPrincipal(null); setLoading(false); setDraftMessage('');
  }
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    const abort = new AbortController();
    async function recover() {
      const generation = authGeneration.current;
      try {const {data} = await client.request<Principal>('/v1/auth/me', {signal: abort.signal}); if (!abort.signal.aborted && generation === authGeneration.current) authenticated(data);}
      catch (error) {if (!abort.signal.aborted && generation === authGeneration.current) {if (error instanceof ClientError && error.status === 401) invalidate(); else setErrors(errorLines(error));}}
      finally {if (!abort.signal.aborted) setLoading(false);}
    }
    void recover(); window.addEventListener('issus:unauthenticated', invalidate); window.addEventListener('focus', recover);
    const timer = setInterval(() => void recover(), 30000);
    return () => {abort.abort(); clearInterval(timer); window.removeEventListener('issus:unauthenticated', invalidate); window.removeEventListener('focus', recover);};
  }, [client]);
  useEffect(() => {
    if (!principal?.expiresAt) return;
    const timer = setTimeout(invalidate, Math.max(0, new Date(principal.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [principal]);
  function connected(value: Principal) {
    authGeneration.current++; authenticated(value, true);
    if (location.pathname === '/login') location.replace(safeReturnPath(new URLSearchParams(location.search).get('returnTo'), location.origin));
  }
  const route = resolveAppRoute(location.pathname, location.search), repo = route.repo;
  const view = loading ? <><h1>{ko.app}</h1><Feedback loading/></> : appRouteView(route, client, principal, connected);
  return <SessionDraftProvider memory={drafts} scope={scope.current}><AppShell principal={principal} repo={repo} aside={principal && 'number' in route ? <IssueContext client={client} repo={route.repo} number={route.number}/> : undefined} session={<SessionConnection principal={principal} loading={loading} onConnected={connected}/>}>
    <Feedback errors={errors}/>{principal && !hasBrowserCsrf() && <p role="status">{ko.csrfMissing}</p>}
    {principal && <DraftRecovery pending={drafts.hasPending(scope.current)} message={draftMessage} onRestore={() => {if (drafts.restore(scope.current)) {setVersion(count => count + 1); setDraftMessage(sessionKo.draftRestored);}}} onDiscard={() => {drafts.discard(scope.current); setDraftMessage(sessionKo.draftDiscarded);}}/>}
    <div key={`${principal?.sessionId ?? 'anonymous'}:${version}:${pagePath}`}>{view}</div>
  </AppShell></SessionDraftProvider>;
}
