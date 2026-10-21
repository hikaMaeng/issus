import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient} from 'issus_domain/front';
import {checkIssueBody} from 'issus_domain/common';
import {IssueForm, parseBodyDraft, bodyFromFields, initialBody, EditSession} from './index.js';

const client = new IssusClient({server: 'http://test.invalid'});
test('U2 create header has ordered required keys and never creates COMPACT/REPLY-IN', () => {
  const body = initialBody('tt-1-alpha', new Date('2026-10-21T12:00:00Z'));
  assert.equal(checkIssueBody(body).length, 0); assert.match(body, /^STATE:running OWNER:tt-1-alpha UPDATED:/);
  const fields = parseBodyDraft(body); fields.fields.COMPACT = '1000001'; fields.fields['REPLY-IN'] = '#2'; fields.fields.BOARD = '#1';
  const result = bodyFromFields(fields); assert.ok(!result.includes('COMPACT:')); assert.ok(!result.includes('REPLY-IN:')); assert.ok(result.includes('BOARD:#1'));
});
test('U2 structured edit preserves OWNER and managed pointers while raw is not silently corrected', () => {
  const original = 'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T12:00+00:00 REPLY-IN:#2 COMPACT:1000001 BOARD:#1\n  원문\n';
  const fields = parseBodyDraft(original); fields.fields.OWNER = 'tt-1-bravo'; fields.fields.COMPACT = '1000002'; fields.fields['REPLY-IN'] = '#3'; fields.fields.STATE = 'done';
  const result = bodyFromFields(fields, original); assert.match(result, /OWNER:tt-1-alpha/); assert.match(result, /REPLY-IN:#2 COMPACT:1000001/); assert.ok(result.endsWith('\n  원문\n'));
  const raw = original.replace('OWNER:tt-1-alpha','OWNER:tt-1-bravo'); assert.equal(parseBodyDraft(raw).fields.OWNER, 'tt-1-bravo');
});
test('U2 412 conflict keeps draft/base intact until explicit merge and mandates recheck', () => {
  const base = {body: 'original', revision: 1, etag: '"1"'}, model = new EditSession(base, 'my draft');
  const latest = {body: 'concurrent', revision: 2, etag: '"2"'}; model.conflict(latest);
  assert.equal(model.draft, 'my draft'); assert.equal(model.base.revision, 1); assert.equal(model.latest, latest);
  model.merge(); assert.equal(model.draft, 'my draft'); assert.equal(model.base.revision, 2); assert.equal(model.needsCheck, true);
});
test('U2 create/edit semantic forms keep raw body, preview and read-only edit fields', () => {
  const create = renderToStaticMarkup(<IssueForm client={client} repo="o/r" principal={{alias: 'tt-1-alpha'}}/>);
  assert.ok(create.includes('aria-label="이슈 개설"')); assert.ok(create.includes('문법 검사 · 개설 문맥 미검증')); assert.ok(!create.includes('id="issue-form-COMPACT"'));
  const edit = renderToStaticMarkup(<IssueForm client={client} repo="o/r" initial={{issue: {number: 1, title: 'title', isOpen: true, state: 'running'}, body: initialBody('tt-1-alpha'), envelope: {}, revision: 7}}/>);
  assert.ok(edit.includes('aria-label="본문 편집"')); assert.ok(edit.includes('aria-label="본문 변경 비교"')); assert.ok(edit.includes('id="issue-form-OWNER"')); assert.ok(edit.includes('readOnly=""')); assert.ok(edit.includes('&quot;7&quot;'));
});
