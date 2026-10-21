import type {IssusClient} from 'issus_domain/front';
import {ReferenceLink, issueHref} from '../reference/index.js';
/** One definition list preserves all canonical keys, linking only interactive values. */
export function Envelope({fields, client, repo}: {fields: object; client?: IssusClient; repo?: string}) {
  const chips = !!client && !!repo;
  return <dl style={chips ? {display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)'} : undefined}>{Object.entries(fields).map(([key, value]) => {
    const text = String(value), ids = ['RE','SUPERSEDES','COMPACT','SEEN'].includes(key) ? text.split(',') : [];
    const href = repo && ['BOARD','REPLY-IN'].includes(key) ? issueHref(repo, text) : undefined;
    const alias = text.split('/')[0];
    return <div key={key} data-testid="envelope-chip" data-envelope-key={key} style={chips ? {display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--ui-space-1)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius)', padding: 'var(--ui-space-1) var(--ui-space-2)', maxWidth: '100%'} : undefined}><dt>{key}</dt><dd>{client && repo && ids.length ? ids.map((id, index) => <span key={`${id}:${index}`}>{index > 0 ? ', ' : ''}<ReferenceLink client={client} repo={repo} id={id} supersedes={key === 'SUPERSEDES'}/></span>) : href ? <a href={href}>{text}</a> : repo && ['FROM','TO','OWNER'].includes(key) && text !== 'ALL' ? <a href={`/owners/${encodeURIComponent(repo.split('/')[0])}/aliases?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(alias)}`}>{text}</a> : text}</dd></div>;
  })}</dl>;
}
