import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient} from 'issus_domain/front';
import {ReferenceLink, issueHref} from './index.js';
import {Envelope} from '../envelope/index.js';
test('U2 references have real named anchors and never fabricate an issue route from a comment id', () => {
  const client = new IssusClient({server: 'http://test.invalid'});
  const html = renderToStaticMarkup(<ReferenceLink client={client} repo="o/r" id="1000001"/>);
  assert.ok(html.includes('href="#comment-1000001"')); assert.ok(html.includes('aria-label="참조 댓글 1000001"')); assert.ok(!html.includes('/issues/1000001'));
  assert.equal(issueHref('o/r','#2'),'/repos/o/r/issues/2'); assert.equal(issueHref('o/r','other/repo#3'),'/repos/other/repo/issues/3');
  assert.equal(issueHref('o/r','javascript:alert(1)'),undefined); assert.equal(issueHref('o/r','1000001'),undefined);
});
test('U2 envelope remains one dl with chips, separate RE/SUPERSEDES references, sid and every optional key', () => {
  const client = new IssusClient({server: 'http://test.invalid'}), fields = {FROM: 'tt-1-alpha/s2', TO: 'ALL', TYPE: 'NOTE', RE: '1000001,1000002', SUPERSEDES: '1000003', 'MIRROR-OF': 'https://example.invalid/ref', GATE: 'g1', DESTRUCTIVE: 'own-fixture'};
  const html = renderToStaticMarkup(<Envelope fields={fields} client={client} repo="o/r"/>);
  assert.equal((html.match(/<dl(?: |>)/g) ?? []).length,1); assert.equal((html.match(/data-testid="envelope-chip"/g) ?? []).length,Object.keys(fields).length);
  assert.ok(html.includes('tt-1-alpha/s2')); assert.ok(html.includes('aria-label="참조 댓글 1000001"')); assert.ok(html.includes('aria-label="참조 댓글 1000002"')); assert.ok(html.includes('aria-label="대체 대상 1000003"'));
  for (const key of Object.keys(fields)) assert.ok(html.includes(`<dt>${key}</dt>`));
});
