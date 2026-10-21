import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient} from 'issus_domain/front';
import {checkComment, TYPES, REQUIRED} from 'issus_domain/common';
import {Composer, parseDraft, serializeDraft, draftSize, quickDraft, requiredFields, composerReasonField, WriteAttempt} from './index.js';
import {FrontClientError, ClientError, OperationTimeout} from '../../entry/client/index.js';

const client = new IssusClient({server: 'http://test.invalid'}), from = 'tt-1-alpha/s1';
const principal = {alias: 'tt-1-alpha', sid: 's1', kind: 'session'};
test('U2 TYPE13 uses canonical enums/required keys and raw server validation remains reachable', () => {
  const html = renderToStaticMarkup(<Composer client={client} path="/v1/repos/o/r/issues/1" principal={principal} onPosted={() => {}}/>);
  assert.ok(html.includes('aria-label="댓글 작성"')); assert.ok(html.includes('noValidate=""'));
  assert.ok(html.includes('aria-label="댓글 미리보기"')); assert.ok(html.includes('id="comment-body"'));
  for (const type of TYPES) {assert.ok(html.includes(`value="${type}"`)); for (const key of REQUIRED[type] ?? []) assert.ok(requiredFields(type).includes(key));}
  for (const type of ['ASK','HOLD','DECISION','HANDOFF']) assert.ok(requiredFields(type).includes('ACK-BY'));
  assert.ok(requiredFields('HOLD').includes('SEEN'));
  assert.ok(html.includes('readOnly=""'));
});
test('U2 raw round-trip detects reordered/unknown/duplicate keys and preserves body bytes', () => {
  const raw = `FROM:${from} TO:ALL TYPE:NOTE\n  text\n\n`;
  assert.equal(parseDraft(raw).lossless, true); assert.equal(serializeDraft(parseDraft(raw).draft), raw);
  for (const raw of [`TO:ALL FROM:${from} TYPE:NOTE\nbody`, `FROM:${from} TO:ALL TYPE:NOTE X:unknown\nbody`, `FROM:${from} TO:ALL TYPE:NOTE TYPE:ASK\nbody`, 'legacy\n<script>x</script>']) assert.equal(parseDraft(raw).lossless, false);
});
test('U2 codepoint and HTTP JSON byte limits are distinct and board NOTE/COMPACT boundaries stay exact', () => {
  const raw = `FROM:${from} TO:ALL TYPE:NOTE\n😀한글`;
  const size = draftSize(raw, true); assert.equal(size.chars, Array.from(raw).length); assert.ok(size.chars < raw.length);
  assert.equal(size.bytes, Buffer.byteLength(JSON.stringify({body: raw}))); assert.equal(size.limit, 1500);
  assert.equal(draftSize(raw).limit, 4000); assert.equal(draftSize(raw.replace('TYPE:NOTE','TYPE:COMPACT'), true).limit, 2000);
});
test('U2 board selectors exclude coordination types while raw invalid requests remain available to the server', () => {
  const html = renderToStaticMarkup(<Composer client={client} path="/v1/repos/o/r/issues/1" principal={principal} board onPosted={() => {}}/>);
  for (const type of ['NOTE','ACK','ALIAS','COMPACT']) assert.ok(html.includes(`value="${type}"`));
  for (const type of ['ASK','HOLD','CLAIM','DECISION','HANDOFF']) assert.ok(!html.includes(`value="${type}"`));
  assert.ok(html.includes('id="comment-body"'));
});
test('U2 quick ACK/HOLD/DECISION/RELEASE are editable protocol drafts with no optimistic state changes', () => {
  const comment = {id: '1000001', body: 'original', envelope: {FROM: 'tt-1-bravo/s1', TO: 'tt-1-alpha', TYPE: 'HOLD'}}, now = new Date('2026-10-21T12:00:00Z');
  const ack = quickDraft('ACK', from, comment, '1000001', now); assert.match(ack, /TO:tt-1-bravo TYPE:ACK RE:1000001/); assert.equal(checkComment(ack).length, 0);
  const hold = quickDraft('HOLD', from, comment, '1000001', now); assert.match(hold, /ACK-BY:2026-10-21T12:05:00\+00:00 SEEN:1000001/); assert.equal(checkComment(hold).length, 0);
  const decision = quickDraft('DECISION', from, comment, '1000001', now); assert.match(decision, /TO:tt-1-alpha TYPE:DECISION/); assert.match(decision, /SUPERSEDES:1000001/); assert.equal(checkComment(decision).length, 0);
  const release = quickDraft('RELEASE', from, {...comment, envelope: {FROM: from, TO: 'ALL', TYPE: 'CLAIM'}}, '1000001', now); assert.match(release, /TO:ALL TYPE:RELEASE RE:1000001/);
  const noenv = quickDraft('NOENV', from, comment, '1000001', now); assert.equal(checkComment(noenv).length, 0); assert.match(noenv, /ASK @tt-1-bravo:/);
});
test('U2 422 maps only exact protocol keys/required diagnostics and never guesses alias→TO', () => {
  for (const [message, field] of [['지시성 TYPE ASK: ACK-BY 필수','ACK-BY'], ['TYPE CLAIM: DUE 필수','DUE'], ['TYPE RELEASE: RE 필수','RE'], ['TYPE CLAIM: SEEN 필수','SEEN'], ['필수 봉투 키 없음 FROM','FROM']]) assert.equal(composerReasonField({code: 'PROTOCOL', path: 'body', message}), field);
  assert.equal(composerReasonField({code: 'RECIPIENT_UNKNOWN', path: 'alias', message: '등록되지 않은 별칭'}), undefined);
  assert.equal(composerReasonField({code: 'PROTOCOL', path: 'body', message: 'some TYPE CLAIM: DUE 필수'}), undefined);
});
test('U2 uncertain requests retry the original payload/key; final422 releases the key for corrected input', async () => {
  const calls: {key: string; body: unknown}[] = []; let count = 0;
  const stub = {write: async (_path: string, options: {key: string; body: unknown}) => {calls.push({key: options.key, body: options.body}); if (count++ === 0) throw new ClientError(0,'CONNECTION_FAILED'); if (count === 2) throw new FrontClientError(422,'VALIDATION_FAILED',[{code: 'PROTOCOL', path: 'body', message: 'exact reason'}]); return {commentId: '1000002'};}} as unknown as IssusClient;
  const model = new WriteAttempt(); await assert.rejects(model.run(stub, '/comments', {method: 'POST', body: {body: 'old'}}));
  await assert.rejects(model.run(stub, '/different', {method: 'POST', body: {body: 'changed'}}));
  assert.equal(calls[0].key, calls[1].key); assert.deepEqual(calls[1].body, {body: 'old'}); assert.equal(model.pending, undefined);
  await model.run(stub, '/comments', {method: 'POST', body: {body: 'corrected'}}); assert.notEqual(calls[1].key, calls[2].key); assert.deepEqual(calls[2].body, {body: 'corrected'});
});
test('U2 operation timeout retains its operation id and immutable request for explicit confirmation', async () => {
  let key = ''; const model = new WriteAttempt(), ids: string[] = [];
  const stub = {write: async (_path: string, options: {key: string; onAccepted: (op: {operationId: string; statusUrl: string}) => void}) => {key = options.key; options.onAccepted({operationId: 'operation-1', statusUrl: '/v1/operations/operation-1'}); throw new OperationTimeout('operation-1', options.key);}} as unknown as IssusClient;
  await assert.rejects(model.run(stub, '/comments', {method: 'POST', body: {body: 'draft'}}, id => ids.push(id)), OperationTimeout);
  assert.equal(model.pending?.key, key); assert.equal(model.pending?.operationId, 'operation-1'); assert.ok(ids.includes('operation-1'));
});
