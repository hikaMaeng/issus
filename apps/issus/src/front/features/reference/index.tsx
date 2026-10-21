import {useRef, useState, type MouseEvent} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {repoPath, errorLines, type CommentView} from '../../entry/client/index.js';
import {ConfirmDialog} from '../session/index.js';
import {issueKo} from '../../resources/issue.js';
import {ko} from '../../resources/index.js';

/** Route issue references without inventing an issue number for a comment. */
export function issueHref(repo: string, reference?: string): string|undefined {
  const match = /^(?:([^/#]+\/[^/#]+))?#([1-9]\d*)$/.exec(reference ?? '');
  return match ? `/repos/${(match[1] ?? repo).split('/').map(encodeURIComponent).join('/')}/issues/${match[2]}` : undefined;
}
/** Existing anchors focus their original article; folded/older ids are fetched once in an inert modal. */
export function ReferenceLink({client, repo, id, supersedes = false, onFollow}: {client: IssusClient; repo: string; id: string; supersedes?: boolean; onFollow?: () => void}) {
  const [open, setOpen] = useState(false), [comment, setComment] = useState<CommentView|null>(null), [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(false);
  const request = useRef(0), suspended = useRef<HTMLDialogElement|null>(null);
  function close() {setOpen(false); request.current++; if (suspended.current?.isConnected) suspended.current.showModal(); suspended.current = null;}
  async function show(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(`comment-${id}`);
    event.preventDefault();
    if (target && target.dataset.collapsed !== 'true') {onFollow?.(); target.scrollIntoView({block: 'center'}); target.focus(); history.replaceState(history.state, '', `#comment-${id}`); return;}
    suspended.current = event.currentTarget.closest('dialog[open]'); suspended.current?.close();
    setOpen(true); setErrors([]); setLoading(true); const sequence = ++request.current;
    try {const result = await client.request<CommentView>(`${repoPath(repo)}/comments/${encodeURIComponent(id)}`); if (sequence === request.current) setComment(result.data);}
    catch (error) {if (sequence === request.current) setErrors(errorLines(error));}
    finally {if (sequence === request.current) setLoading(false);}
  }
  return <><a href={`#comment-${id}`} onClick={event => void show(event)} aria-label={supersedes ? issueKo.supersedes(id) : issueKo.reference(id)}>{id}</a>
    <ConfirmDialog open={open} name={issueKo.reference(id)} onClose={close}>
      <h2>{issueKo.reference(id)}</h2>{loading && <p role="status" aria-busy="true">{ko.loading}</p>}
      {errors.length > 0 && <div role="alert"><p>{issueKo.referenceFailed}</p>{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}
      {!loading && !errors.length && comment && <><time dateTime={comment.createdAt}>{comment.createdAt}</time><pre>{comment.body}</pre></>}
      <button type="button" onClick={close}>{issueKo.closeReference}</button>
    </ConfirmDialog></>;
}
