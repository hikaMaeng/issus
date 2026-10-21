import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import type {IssusClient} from 'issus_domain/front';
import {resolveAppRoute} from './routes.js';
import {appRouteView} from './view.js';
import {Board} from '../../pages/board/index.js';
import {IssueCreate} from '../../pages/issue-create/index.js';
import {IssueEdit} from '../../pages/issue-edit/index.js';
import {Compact} from '../../pages/compact/index.js';
import {Login} from '../../pages/login/index.js';
const client = {} as IssusClient, principal = {kind: 'session', ownerId: 'owner', alias: 'tt-1-alpha', sid: 's1'};

test('all four previously unassembled URLs resolve to the actual public production component', () => {
  const cases = [
    ['/repos/owner/repo/board', Board, '공통 게시판'],
    ['/repos/owner/repo/issues/new', IssueCreate, '이슈 개설'],
    ['/repos/owner/repo/issues/12/edit', IssueEdit, '본문 편집'],
    ['/repos/owner/repo/issues/12/compact', Compact, 'COMPACT 도우미'],
  ] as const;
  for (const [path, component, title] of cases) {
    const element = appRouteView(resolveAppRoute(path), client, principal, () => {});
    assert.equal(element.type, component);
    assert.equal(element.props.repo, 'owner/repo');
    const html = renderToStaticMarkup(element);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1); assert.ok(html.includes(title));
    assert.ok(!html.includes('기능을 준비하고 있습니다'));
    assert.equal(appRouteView(resolveAppRoute(path), client, null, () => {}).type, Login);
  }
});

test('route resolution keeps direct/trailing-slash/back-forward URLs deterministic and rejects malformed paths', () => {
  assert.deepEqual(resolveAppRoute('/repos/a%20b/c/issues/7/edit/'), {page: 'issue-edit', repo: 'a b/c', number: 7});
  assert.deepEqual(resolveAppRoute('/repos/a/c/issues/7'), {page: 'issue', repo: 'a/c', number: 7});
  assert.deepEqual(resolveAppRoute('/repos/a/c/issues'), {page: 'issues', repo: 'a/c'});
  assert.deepEqual(resolveAppRoute('/owners/a/aliases', '?repo=a%2Fc'), {page: 'roster', owner: 'a', repo: 'a/c'});
  for (const path of ['/repos/a/c/issues/new/edit', '/repos/a/c/board/7', '/repos/%GG/c/board', '/repos/a/c/issues/0', '/repos/a/c/issues/9007199254740992', '/missing']) assert.deepEqual(resolveAppRoute(path), {page: 'not-found'});
});
