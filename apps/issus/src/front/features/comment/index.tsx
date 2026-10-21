import {header} from 'issus_domain/common';
import type {CommentView} from '../../entry/client/index.js';
import {Envelope} from '../envelope/index.js';
import {CompactMarker} from '../compact/index.js';
import {ko} from '../../resources/index.js';

/** Legacy records are read-only warnings; raw Markdown is always inert text. */
export function Comment({comment}: {comment: CommentView}) {
  const parsed = header(comment.body), noenv = comment.validity === 'noenv' || parsed._noenv;
  return <li><article aria-label={ko.comment(comment.id)} data-testid="comment" data-comment-id={comment.id}>
    {noenv && <p role="alert" className="warning">{ko.noenv}</p>}
    {comment.envelope.TYPE === 'COMPACT' ? <CompactMarker body={comment.body}/> : <h2>{ko.comment(comment.id)}</h2>}
    <Envelope fields={comment.envelope}/>
    {comment.createdAt ? <time dateTime={comment.createdAt}>{comment.createdAt}</time> : <p>{ko.unknownDate}</p>}
    <pre>{comment.body.split(/\r?\n/).slice(comment.envelope.TYPE === 'COMPACT' ? 2 : 1).join('\n')}</pre>
    <details><summary>{ko.raw}</summary><pre>{comment.body}</pre></details>
  </article></li>;
}
