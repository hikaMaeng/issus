import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseRoster, RosterTable} from './index.js';

test('ROSTER parsing does not promote arbitrary body rows or following section rows', () => {
  const body = 'GOAL: x\nwrong | r | m | s | s1\nROSTER: tt-1-alpha | 담당 | gpt | UI | s2\n| alias | role | model | scope | sid |\n| --- | --- | --- | --- | --- |\n| tt-1-beta | 검토 | m | review | s1 |\nNEXT: 확인\nwrong | r | m | s | s1';
  assert.deepEqual(parseRoster(body).map(row => row.alias), ['tt-1-alpha','tt-1-beta']);
});
test('ROSTER supports canonical inline rows and keeps sid separate from resource ownership', () => {
  const rows = parseRoster('ROSTER: tt-1-alpha | 역할 | 모델 | 범위 | s1 · tt-1-beta | 검토 | 모델 | 범위 | s2');
  assert.equal(rows.length, 2); assert.equal(rows[1].sid, 's2');
  const html = renderToStaticMarkup(<RosterTable rows={rows} source="이슈 본문 ROSTER · revision 2"/>);
  assert.ok(html.includes('aria-label="ROSTER"')); assert.ok(html.includes('data-alias="tt-1-beta"')); assert.ok(html.includes('revision 2')); assert.ok(!html.includes('별칭 레지스트리'));
});
