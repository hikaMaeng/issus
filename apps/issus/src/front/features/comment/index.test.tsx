import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Comment} from './index.js';
import {Envelope} from '../envelope/index.js';
import {errorLines, ClientError, readHistory, allPages} from '../../entry/client/index.js';
import {IssusClient} from 'issus_domain/front';
import {ko} from '../../resources/index.js';

test('U2 OTHER starts with only its envelope while shared HOLD/DECISION remain full and focusable', () => {
  const make = (TYPE: string) => ({id: '1000001', body: `FROM:tt-1-alpha/s1 TO:tt-1-other TYPE:${TYPE}\nprivate-full-body`, envelope: {FROM: 'tt-1-alpha/s1', TO: 'tt-1-other', TYPE}});
  const folded = renderToStaticMarkup(<Comment comment={make('NOTE')} priority="OTHER"/>);
  assert.ok(folded.includes('OTHER 댓글 1000001 전문 보기')); assert.ok(!folded.includes('private-full-body')); assert.ok(folded.includes('data-collapsed="true"'));
  for (const type of ['HOLD','DECISION']) {const html = renderToStaticMarkup(<Comment comment={make(type)} priority="OTHER"/>); assert.ok(html.includes('private-full-body')); assert.ok(!html.includes('data-collapsed="true"')); assert.ok(html.includes('id="comment-1000001"')); assert.ok(html.includes('tabindex="-1"'));}
});

test('B-01 contract: legacy warning and raw HTML stay inert', () => {
  const html = renderToStaticMarkup(<Comment comment={{id: '1000001', body: '작성: legacy\n<script>alert(1)</script>', envelope: {}, validity: 'noenv', createdAt: '2026-10-21T09:00:00Z'}}/>);
  assert.ok(html.includes(ko.noenv)); assert.ok(html.includes('role="alert"')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('data-comment-id="1000001"')); assert.ok(html.includes('dateTime="2026-10-21T09:00:00Z"'));
});
test('B-01 contract: COMPACT strong marker is an actual h2', () => {
  const marker = '## ===== COMPACT #2 through 1000001 =====';
  const html = renderToStaticMarkup(<Comment comment={{id: '1000002', body: `FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT SEEN:1000001\n${marker}\n요약`, envelope: {FROM: 'tt-1-alpha/s1', TO: 'ALL', TYPE: 'COMPACT', SEEN: '1000001'}}}/>);
  assert.ok(html.includes(`<h2 data-testid="compact-marker">${marker}</h2>`)); assert.ok(html.includes(ko.summary)); assert.ok(!html.includes(ko.noenv));
});
test('B-01 contract: all envelope keys are definition terms with visible values', () => {
  const html = renderToStaticMarkup(<Envelope fields={{STATE: 'running', OWNER: 'tt-1-alpha', UPDATED: '2026-10-21T18:00+09:00', BOARD: '#1', COMPACT: '1000002'}}/>);
  for (const key of ['STATE', 'OWNER', 'UPDATED', 'BOARD', 'COMPACT']) assert.ok(html.includes(`<dt>${key}</dt><dd>`));
  assert.ok(html.startsWith('<dl>'));
});
test('B-02 contract: 422 reason spelling and order remain authoritative', () => {
  const reasons = ['지시성 TYPE ASK: ACK-BY 필수', 'TYPE ASK: 본문에 `ASK @<TO>: <요청 1개>` 줄 정확히 1개(현재 0) — 요청이 둘이면 댓글 둘'];
  assert.deepEqual(errorLines(new ClientError(422, 'VALIDATION_FAILED', reasons)), reasons);
  assert.ok(errorLines(new ClientError(409, 'CLOSE_BLOCKED', [], {waitingDirectives: ['1000001']})).join('\n').includes('1000001'));
});
test('history defaults to since-compact and hydrates canonical validity/time/full body', async () => {
  const urls: string[] = [];
  const client = new IssusClient({server: 'http://test.invalid', fetch: async input => {
    const url = new URL(input); urls.push(url.pathname + url.search);
    const data = url.pathname.endsWith('/comments/1000001') ? {id: '1000001', body: '작성: legacy\n전문', envelope: {}, validity: 'noenv', createdAt: '2026-10-21T09:00:00Z'} : {items: [{id: '1000001', body: '작성: legacy'}], compact: null, nextCursor: null};
    return Response.json(data);
  }});
  const result = await readHistory(client, 'o/r', 1, false, new AbortController().signal);
  assert.ok(urls[0].endsWith('sinceCompact=true')); assert.equal(result.items[0].validity, 'noenv'); assert.equal(result.items[0].body, '작성: legacy\n전문'); assert.ok(result.items[0].createdAt);
});
test('immutable pagination consumes every page exactly once', async () => {
  const client = new IssusClient({server: 'http://test.invalid', fetch: async input => Response.json(new URL(input).searchParams.has('cursor') ? {items: [2], nextCursor: null} : {items: [1], nextCursor: 'next'})});
  assert.deepEqual(await allPages<number>(client, '/v1/repos', new AbortController().signal), [1, 2]);
});

test('issue view folds old inbox-union deliveries at COMPACT and full toggle restores them', async () => {
  const comments = ['1000001', '1000002', '1000003'].map(id => ({id, body: `FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\ncomment ${id}`, envelope: {TYPE: id === '1000002' ? 'COMPACT' : 'NOTE'}}));
  const client = new IssusClient({server: 'http://test.invalid', fetch: async input => {
    const url = new URL(input), id = /\/comments\/(\d+)$/.exec(url.pathname)?.[1];
    return Response.json(id ? comments.find(comment => comment.id === id) : {items: [comments[0], comments[2]], compact: comments[1], nextCursor: null});
  }});
  const folded = await readHistory(client, 'o/r', 1, false, new AbortController().signal);
  assert.equal(folded.compact?.id, '1000002'); assert.deepEqual(folded.items.map(comment => comment.id), ['1000003']);
  const full = await readHistory(client, 'o/r', 1, true, new AbortController().signal);
  assert.equal(full.compact?.id, '1000002'); assert.deepEqual(full.items.map(comment => comment.id), ['1000001', '1000003']);
});
