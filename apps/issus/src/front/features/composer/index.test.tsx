import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient} from 'issus_domain/front';
import {checkComment, TYPES, REQUIRED} from 'issus_domain/common';
import {Composer, parseDraft, serializeDraft, draftSize, quickDraft, requiredFields, composerReasonField, WriteAttempt} from './index.js';
import {FrontClientError, ClientError, OperationTimeout} from '../../entry/client/index.js';
import {errorReasons} from '../../entry/client/index.js';
import {fieldFeedback} from './model.js';
import {ComposerField, FieldErrors} from './fields.js';
import {SessionDraftMemory, SessionDraftProvider} from '../session/index.js';

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

for (const probe of [
  {field: 'TO', body: `FROM:${from} TO:tt-1-bravo,tt-1-charlie TYPE:NOTE\nprobe`},
  {field: 'ACK-BY', body: `FROM:${from} TO:ALL TYPE:NOTE ACK-BY:tomorrow\nprobe`},
  {field: 'STATE', body: `FROM:${from} TO:ALL TYPE:REPORT STATE:invalid\nprobe`},
]) test(`U2 read-only canonical ${probe.field} syntax probe maps body422 to exact described field`, () => {
  const messages = checkComment(probe.body);
  assert.equal(messages.length, 1);
  const error = new FrontClientError(422, 'VALIDATION_FAILED', messages.map(message => ({code: 'PROTOCOL', path: 'body', message})));
  const reasons = errorReasons(error), feedback = fieldFeedback(reasons, probe.field, `composer-field-${probe.field}`);
  assert.notEqual(composerReasonField(reasons[0]), undefined);
  assert.equal(composerReasonField(reasons[0]), probe.field);
  assert.equal(feedback.invalid, true);
  assert.deepEqual(feedback.messages.map(reason => reason.message), messages);
  const html = renderToStaticMarkup(<ComposerField field={probe.field} value={parseDraft(probe.body).draft.fields[probe.field]} reasons={reasons} required={false} readOnly={false} stateDisabled={false} onChange={() => {}}/>);
  assert.ok(html.includes(`id="composer-field-${probe.field}"`));
  assert.ok(html.includes('aria-invalid="true"'));
  assert.ok(html.includes(`aria-describedby="${feedback.describedBy}"`));
  for (const reason of feedback.messages) assert.ok(html.includes(renderToStaticMarkup(<p id={reason.id}>{reason.message}</p>)));
  assert.deepEqual(checkComment(probe.body), messages);
});

test('U2 canonical explicit field syntax variants map without assigning body-content or similar messages', () => {
  for (const [token, field] of [
    ['FROM:bad', 'FROM'], ['FROM:tt-1-alpha/INVALID', 'FROM'], ['FROM:tt-1-alpha/by-invalid', 'FROM'],
    ['TO:#1', 'TO'], ['TO:@bad', 'TO'], ['TO:reviewer', 'TO'], ['CC:ALL', 'CC'], ['CC:@bad', 'CC'], ['CC:ALL,ALL', 'CC'],
    ['DUE:tomorrow', 'DUE'], ['RE:bad', 'RE'], ['SEEN:bad', 'SEEN'], ['SUPERSEDES:bad', 'SUPERSEDES'],
    ['REPLY-IN:bad', 'REPLY-IN'], ['MIRROR-OF:bad', 'MIRROR-OF'], ['TYPE:BAD', 'TYPE'], ['TYPE:READY', 'TYPE'], ['STATE:done', 'STATE'],
  ]) {
    const [key] = token.split(':'), fields = {FROM: from, TO: 'ALL', TYPE: 'NOTE', [key]: token.slice(key.length + 1)};
    const messages = checkComment(serializeDraft({fields, text: 'probe'}));
    assert.ok(messages.length > 0, token);
    for (const message of messages) assert.equal(composerReasonField({code: 'PROTOCOL', path: 'body', message}), field, message);
  }
  for (const message of ['봉투 키 중복 TO', '지시성 TYPE ASK: TO는 1명(ALL 금지) — 모두에게 알릴 뿐이면 NOTE', 'TYPE ALIAS: TO:ALL 필수', 'TYPE COMPACT: TO:ALL 필수(요약은 전원 공유)']) assert.equal(composerReasonField({code: 'PROTOCOL', path: 'body', message}), 'TO');
  const toReason = checkComment(`FROM:${from} TO:tt-1-bravo,tt-1-charlie TYPE:NOTE\nprobe`)[0];
  for (const reason of [
    {code: 'X', path: 'alias', message: toReason},
    {code: 'X', path: 'body', message: 'prefix ' + toReason},
    {code: 'X', path: 'body', message: toReason + ' suffix'},
    {code: 'X', path: 'body', message: 'TO에 문제가 있음'},
    {code: 'X', path: 'body', message: 'TYPE VERIFY: 본문에 `VERDICT:PASS|FAIL|BLOCKED` 필수'},
    {code: 'X', path: 'body', message: '`ASK @tt-1-bravo:` 줄의 대상이 TO(tt-1-alpha)와 다름'},
  ]) assert.equal(composerReasonField(reason), undefined);
  assert.equal(composerReasonField({code: 'X', path: 'envelope.TO', message: 'STATE 오류'}), 'TO');
});

test('U2 field descriptions preserve duplicate reason order, escape text, and clear invalid state', () => {
  const messages = ['first <script>alert(1)</script>', 'second & reason', 'first <script>alert(1)</script>'];
  const reasons = messages.map(message => ({code: 'PROTOCOL', path: 'envelope.TO', message}));
  reasons.splice(1, 0, {code: 'PROTOCOL', path: 'envelope.STATE', message: 'other field'});
  const feedback = fieldFeedback(reasons, 'TO', 'composer-field-TO');
  assert.equal(feedback.describedBy, 'composer-field-TO-error-0 composer-field-TO-error-1 composer-field-TO-error-2');
  assert.deepEqual(feedback.messages.map(reason => reason.message), messages);
  const html = renderToStaticMarkup(<FieldErrors feedback={feedback}/>);
  assert.equal(html, feedback.messages.map(reason => renderToStaticMarkup(<p id={reason.id}>{reason.message}</p>)).join(''));
  assert.ok(!html.includes('<script>'));
  const clear = fieldFeedback([], 'TO', 'composer-field-TO');
  assert.equal(clear.invalid, false); assert.equal(clear.describedBy, undefined); assert.deepEqual(clear.messages, []);
  const type = fieldFeedback([{code: 'PROTOCOL', path: 'envelope.TYPE', message: 'TYPE original'}], 'TYPE', 'composer-type');
  assert.equal(renderToStaticMarkup(<FieldErrors feedback={type}/>), '<p id="composer-type-error-0">TYPE original</p>');
});
test('U2 composer restores four non-secret draft slots only after explicit session recovery', () => {
  const memory = new SessionDraftMemory(), scope = 'composer-recovery';
  const body = `FROM:${from} TO:tt-1-bravo TYPE:DECISION ACK-BY:2026-10-21T13:00+00:00\n보존 초안`, fields = parseDraft(body).draft;
  memory.begin(scope);
  for (const [slot, value] of [['body', body], ['fields', fields], ['structured', true], ['deferred', '선행 요약 생략 사유']] as const) memory.write(scope, `composer.${slot}`, value);
  memory.suspend(scope); memory.begin(scope);
  const render = () => renderToStaticMarkup(<SessionDraftProvider memory={memory} scope={scope}><Composer client={client} path="/v1/repos/o/r/issues/1" principal={principal} onPosted={() => {}}/></SessionDraftProvider>);
  assert.ok(!render().includes('보존 초안'));
  assert.equal(memory.restore(scope), true);
  const html = render();
  assert.ok(html.includes('보존 초안')); assert.ok(html.includes('value="tt-1-bravo"')); assert.ok(html.includes('선행 요약 생략 사유'));
  assert.ok(!html.includes('<fieldset hidden='));
  assert.ok(!html.includes('id="composer-errors"')); assert.ok(!html.includes('aria-label="검사 결과"'));
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
