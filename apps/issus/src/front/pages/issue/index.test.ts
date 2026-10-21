import test from 'node:test';
import assert from 'node:assert/strict';
import {IssusClient} from 'issus_domain/front';
import {historyComments, commentPriority, pinnedHistory, readThread} from './model.js';
const comment = (id: string, TYPE = 'NOTE', TO = 'ALL') => ({id, body: `FROM:tt-1-alpha/s1 TO:${TO} TYPE:${TYPE}\nbody`, envelope: {FROM: 'tt-1-alpha/s1', TO, TYPE}});
test('U2 thread merge deduplicates compact/items and preserves integer id order', () => {
  const a = comment('9007199254740993'), b = comment('9007199254740994');
  assert.deepEqual(historyComments({compact: a, items: [b,a], nextCursor: null}).map(c => c.id), [a.id,b.id]);
});
test('U2 new compact does not silently narrow a pinned older snapshot', () => {
  const old = comment('1000001','COMPACT'), next = comment('1000003','COMPACT');
  const view = pinnedHistory({compact: next, items: [old,comment('1000002'),next,comment('1000004')], nextCursor: null}, old);
  assert.equal(view.compact?.id, old.id); assert.deepEqual(historyComments(view).map(c => c.id), ['1000001','1000002','1000003','1000004']);
});
test('U2 canonical priorities preserve server values and shared HOLD/DECISION classify ALL', () => {
  assert.equal(commentPriority(comment('1000001','HOLD','tt-1-other'), ['tt-1-bravo']), 'ALL');
  assert.equal(commentPriority(comment('1000001','DECISION','tt-1-other'), ['tt-1-bravo']), 'ALL');
  assert.equal(commentPriority(comment('1000001','NOTE','tt-1-bravo'), ['tt-1-bravo']), 'ME');
  assert.equal(commentPriority({...comment('1000001'), priority: 'CC'} as ReturnType<typeof comment>, []), 'CC');
});
test('U2 history freezes pagination and fetches OTHER full text only on disclosure, not during initial hydration', async () => {
  const urls: string[] = [], first = {...comment('1000001'), priority: 'ALL'}, other = {...comment('1000002','NOTE','tt-1-other'), priority: 'OTHER'};
  const client = new IssusClient({server: 'http://test.invalid', fetch: async input => {const url = new URL(input); urls.push(url.pathname + url.search); const data = url.pathname.endsWith('/comments/1000001') ? {...first, createdAt: '2026-10-21T12:00:00Z', validity: 'v2'} : url.searchParams.has('cursor') ? {items: [other,first], compact: null, nextCursor: null} : {items: [first], compact: null, nextCursor: 'frozen'}; return new Response(JSON.stringify(data));}});
  const history = await readThread(client,'o/r',1,false,new AbortController().signal);
  assert.equal(history.items.length,2); assert.ok(urls.includes('/v1/repos/o/r/issues/1/comments?sinceCompact=true&cursor=frozen'));
  assert.ok(!urls.some(url => url.endsWith('/comments/1000002'))); assert.equal(history.items[0].createdAt,'2026-10-21T12:00:00Z');
});
