import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {allPages, createBrowserClient, errorLines, issuePath, repoPath, type Principal, type RepoView, type IssueView, type CommentView} from '../../entry/client/index.js';
import {ko, feedbackKo, sessionKo} from '../../resources/index.js';
import {ConfirmDialog} from '../session/index.js';
import {Feedback} from '../feedback/index.js';

interface Diagnostics extends IssueView {activeHolds?: string[]; claims?: string[]; ackState?: {directiveId: string; state: string}[]; compact?: {due: boolean; count: number; chars: number}}
/** Context shows server diagnostics separately from body observations and never duplicates articles. */
export function IssueContext({client, repo, number}: {client: IssusClient; repo: string; number: number}) {
  const [view, setView] = useState<Diagnostics|null>(null), [references, setReferences] = useState<CommentView[]>([]), [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const abort = new AbortController(); let active = false;
    async function refresh() {
      if (active) return; active = true;
      try {
        const {data} = await client.request<Diagnostics>(issuePath(repo, number), {signal: abort.signal});
        if (abort.signal.aborted) return;
        setView(data); setErrors([]);
        const comments: CommentView[] = [];
        for (let start = 0; start < (data.claims?.length ?? 0); start += 4) comments.push(...await Promise.all(data.claims!.slice(start, start + 4).map(id => client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(id)}`, {signal: abort.signal}).then(response => response.data))));
        if (!abort.signal.aborted) setReferences(comments);
      } catch (error) {if (!abort.signal.aborted) setErrors(errorLines(error));} finally {active = false;}
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => {abort.abort(); clearInterval(timer);};
  }, [client, repo, number]);
  const href = (id: string) => `/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${number}#comment-${id}`;
  const ids = (values: readonly string[]) => values.length ? <ul>{values.map(id => <li key={id}><a href={href(id)}>{ko.comment(id)}</a></li>)}</ul> : <p>{feedbackKo.absent}</p>;
  return <><h2>{feedbackKo.diagnostics}</h2><Feedback errors={errors} loading={!view && !errors.length}/>{view && <>
    <dl><div><dt>STATE</dt><dd>{view.envelope.STATE}</dd></div><div><dt>OWNER</dt><dd>{view.envelope.OWNER}</dd></div><div><dt>{feedbackKo.revision}</dt><dd>{view.revision}</dd></div></dl>
    {!!view.activeHolds?.length && <div role="alert"><p>{feedbackKo.activeHolds}</p>{ids(view.activeHolds)}</div>}
    <h3>{feedbackKo.waitingAck}</h3>{ids((view.ackState ?? []).filter(item => item.state === 'waiting').map(item => item.directiveId))}
    <h3>{feedbackKo.claims}</h3>{ids(view.claims ?? [])}{references.map(comment => <details key={comment.id}><summary>{ko.comment(comment.id)} · {comment.envelope.FROM} · {comment.envelope.DUE}</summary><pre>{comment.body}</pre></details>)}<p>{feedbackKo.claimHint}</p>
    <h3>{feedbackKo.compactDue}</h3><p>{String(view.compact?.due ?? false)} · {view.compact?.count ?? 0} / {view.compact?.chars ?? 0}</p>
    <h3>{feedbackKo.bodyObservation}</h3>{['OPEN-ASK','HANDOFF'].map(key => <p key={key}>{key}: {view.body.split(/\r?\n/).find(line => line.startsWith(`${key}:`))?.slice(key.length + 1) || feedbackKo.absent}</p>)}
  </>}</>;
}

/** One navigation tree moves into a native modal at narrow viewports. */
export function AppShell({principal, repo, children, session, aside}: {principal: Principal|null; repo?: string; children: ReactNode; session: ReactNode; aside?: ReactNode}) {
  const [repos, setRepos] = useState<RepoView[]>([]), [narrow, setNarrow] = useState(false), [fold, setFold] = useState(false), [navigationOpen, setNavigationOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const mobile = matchMedia('(max-width: 899px)'), context = matchMedia('(max-width: 1199px)');
    const update = () => {setNarrow(mobile.matches); setFold(context.matches); if (!mobile.matches) setNavigationOpen(false);};
    update(); mobile.addEventListener('change', update); context.addEventListener('change', update);
    return () => {mobile.removeEventListener('change', update); context.removeEventListener('change', update);};
  }, []);
  useEffect(() => {
    if (!principal) {setRepos([]); return;}
    const abort = new AbortController();
    void allPages<RepoView>(createBrowserClient(), '/v1/repos', abort.signal).then(items => {if (!abort.signal.aborted) setRepos(items);}).catch(() => {if (!abort.signal.aborted) setRepos([]);});
    return () => abort.abort();
  }, [principal]);
  const base = repo ? `/repos/${repo.split('/').map(encodeURIComponent).join('/')}` : undefined;
  const links = [
    {href: '/repos', label: ko.repos}, {href: base ? `${base}/issues` : undefined, label: ko.issues},
    {href: repo ? `/inbox?repo=${encodeURIComponent(repo)}` : '/inbox', label: ko.inbox},
    {href: base ? `${base}/board` : undefined, label: feedbackKo.board},
    {href: repo ? `/owners/${encodeURIComponent(repo.split('/')[0])}/aliases?repo=${encodeURIComponent(repo)}` : principal?.owner ? `/owners/${encodeURIComponent(principal.owner)}/aliases` : undefined, label: feedbackKo.roster},
  ];
  const nav = <nav aria-label={ko.navigation}>{links.map(link => link.href ? <a key={link.label} href={link.href} aria-current={new URL(link.href, 'http://internal').pathname === location.pathname ? 'page' : undefined}>{link.label}</a> : <span key={link.label} aria-disabled="true" title={feedbackKo.selectRepo}>{link.label}</span>)}</nav>;
  const context = <aside aria-label={feedbackKo.context}>{aside ?? <><h2>{feedbackKo.information}</h2>{repo && <p>{feedbackKo.selectedRepo}: {repo}</p>}<p>{feedbackKo.claimHint}</p></>}</aside>;
  return <>
    <a className="skip-link" href="#main-content" onClick={() => main.current?.focus()}>{feedbackKo.skip}</a>
    <header className="topbar"><a href="/repos">{ko.app}</a>{narrow && <button onClick={() => setNavigationOpen(true)} aria-expanded={navigationOpen}>{feedbackKo.openNavigation}</button>}<span>{principal?.alias}{principal?.sid ? `/${principal.sid}` : ''}</span></header>
    <div className="app-frame"><div className="sidebar">
      <label htmlFor="repo-switcher">{feedbackKo.currentRepo}</label><select id="repo-switcher" value={repo ?? ''} onChange={event => {if (event.target.value) location.assign(`/repos/${event.target.value.split('/').map(encodeURIComponent).join('/')}/issues`);}}>
        <option value="">{feedbackKo.selectRepo}</option>{repos.map(item => <option key={item.id} value={`${item.owner}/${item.slug}`}>{item.owner}/{item.slug}</option>)}
      </select>
      {!narrow && nav}
      <div className="session-menu"><a href="/sessions" aria-current={location.pathname === '/sessions' ? 'page' : undefined}>{sessionKo.sessions}</a>{session}</div>
    </div><main id="main-content" ref={main} tabIndex={-1}>{children}{fold && <details className="context-fold"><summary>{feedbackKo.foldContext}</summary>{context}</details>}</main>{!fold && context}</div>
    <ConfirmDialog open={narrow && navigationOpen} name={ko.navigation} onClose={() => setNavigationOpen(false)}><h2>{ko.navigation}</h2>{nav}<button onClick={() => setNavigationOpen(false)}>{feedbackKo.closeNavigation}</button></ConfirmDialog>
  </>;
}
