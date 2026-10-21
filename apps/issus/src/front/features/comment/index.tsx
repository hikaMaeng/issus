import {useState} from 'react';
import {header} from 'issus_domain/common';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, repoPath, type CommentView, type Principal} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {CompactMarker} from '../compact/index.js';
import type {ComposerDraft} from '../composer/index.js';
import {QuickReply} from './quick.js';
import {ko} from '../../resources/index.js';
import {issueKo} from '../../resources/issue.js';

/** Legacy records are read-only warnings; raw Markdown is always inert text. */
export function Comment({comment, client, repo, path, principal, seen = comment.id, onDraft, onPosted, priority, board = false, readonly = false}: {
  comment: CommentView; client?: IssusClient; repo?: string; path?: string; principal?: Principal|null; seen?: string;
  onDraft?: (draft: ComposerDraft) => void; onPosted?: () => void; priority?: string; board?: boolean; readonly?: boolean;
}) {
  const parsed = header(comment.body), noenv = comment.validity === 'noenv' || parsed._noenv;
  const [expanded, setExpanded] = useState(false), [full, setFull] = useState<CommentView|null>(null), [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(false);
  const folded = priority === 'OTHER' && !['HOLD','DECISION','COMPACT'].includes(parsed._type), content = full ?? comment;
  async function load() {if (full || loading || !client || !repo) return; setLoading(true); setErrors([]); try {setFull((await client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(comment.id)}`)).data);} catch (error) {setErrors(errorLines(error));} finally {setLoading(false);}}
  const raw = <><pre>{content.body.split(/\r?\n/).slice(comment.envelope.TYPE === 'COMPACT' ? 2 : noenv ? 0 : 1).join('\n')}</pre><details><summary role="button">{ko.raw}</summary><pre>{content.body}</pre></details></>;
  return <li><article id={`comment-${comment.id}`} tabIndex={-1} aria-label={ko.comment(comment.id)} data-testid="comment" data-comment-id={comment.id} data-collapsed={folded && !expanded ? 'true' : undefined} style={noenv ? {borderLeft: '4px solid var(--ui-warning)'} : undefined}>
    {noenv && <p role="alert" className="warning">{ko.noenv}</p>}
    {comment.envelope.TYPE === 'COMPACT' ? <CompactMarker body={comment.body}/> : <h2>{ko.comment(comment.id)}</h2>}
    <Envelope fields={comment.envelope} client={client} repo={repo}/>
    {content.createdAt ? <time dateTime={content.createdAt}>{content.createdAt}</time> : <p>{ko.unknownDate}</p>}
    {folded ? <details onToggle={event => {setExpanded(event.currentTarget.open); if (event.currentTarget.open) void load();}}><summary>{issueKo.other(comment.id)}</summary>{loading && <p role="status" aria-busy="true">{ko.loading}</p>}{errors.length > 0 && <div role="alert">{errors.join('\n')}</div>}{expanded && !loading && !errors.length && raw}</details> : raw}
    {client && path && principal && !readonly && (!folded || expanded) && <QuickReply client={client} path={path} principal={principal} comment={content} seen={seen} onDraft={onDraft} onPosted={onPosted} noenv={noenv} board={board}/>}
  </article></li>;
}
