import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {IssusClient, ClientError, issuePath} from 'issus_domain/front';
import {eventually, provisionBrowserFixture} from './fixture.mjs';

const server = process.env.ISSUS_TEST_SERVER_URL;
assert.ok(server, 'ISSUS_TEST_SERVER_URL required: use the deployed isolated target');
const output = new URL('../../../../.cache/p9-u1/browser/', import.meta.url);
let browser, context, page, fixture, operator;
const pageErrors = [], observations = [], issuedSessions = [];
async function login(target, token, path = '/repos') {
  await target.goto(server + path);
  await target.getByRole('heading', {level: 1}).filter({hasNotText: /^issus$/}).waitFor();
  if (!await target.getByLabel('세션 토큰', {exact: true}).isVisible()) await target.getByRole('button', {name: '세션 연결', exact: true}).click();
  await target.getByLabel('세션 토큰', {exact: true}).fill(token);
  await target.getByRole('button', {name: '연결', exact: true}).click();
  await eventually(() => target.getByLabel('세션 토큰', {exact: true}).inputValue().then(value => value === ''), 'bearer erased');
  // Authentication replaces/closes the disclosure; completion still inspects its real form.
  await eventually(async () => await target.getByRole('form', {name: '세션 연결', exact: true, includeHidden: true}).getAttribute('aria-busy') === 'false', 'server identity confirmed after bearer exchange');
  await eventually(() => target.getByRole('navigation', {name: '주 탐색', exact: true}).getByRole('link', {name: '저장소', exact: true}).count(), 'shell ready');
}
before(async () => {
  const {chromium} = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT ? createRequire(resolve(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, 'package.json'))('playwright') : await import('playwright');
  fixture = await provisionBrowserFixture();
  operator = new IssusClient({server, token: process.env.ISSUS_TEST_BOOTSTRAP_TOKEN});
  browser = await chromium.launch({headless: true});
  context = await browser.newContext({viewport: {width: 1440, height: 1000}}); page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await mkdir(output, {recursive: true});
});
afterEach(async t => {
  if (page) await page.screenshot({path: fileURLToPath(new URL(t.name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,90)+'.png', output)), fullPage: true, mask: [page.getByLabel('세션 토큰', {exact: true}), page.getByLabel('관리 토큰', {exact: true}), page.getByLabel('발급 토큰', {exact: true})]});
});
after(async () => {
  for (const id of issuedSessions) await operator.write('/v1/sessions/'+id, {method: 'DELETE', key: randomUUID()}).catch(() => {});
  await context?.close(); await browser?.close(); await fixture?.cleanup();
  await mkdir(output, {recursive: true});
  await writeFile(new URL('observed.json', output), JSON.stringify({timestamp: new Date().toISOString(), server, pageErrors, observations, browserLaunched: !!browser}, null, 2)+'\n');
  assert.deepEqual(pageErrors, []);
});

test('P9-01 session connection returns internally and stores only CSRF', async () => {
  const destination = `/repos/${fixture.repo}/issues`;
  await login(page, fixture.B.token, '/login?returnTo='+encodeURIComponent(destination));
  await page.waitForURL(server + destination);
  const identity = await page.evaluate(async () => (await fetch('/v1/auth/me')).json());
  assert.equal(identity.alias, fixture.B.alias); assert.equal(identity.sid, fixture.B.sid);
  const storage = await page.evaluate(() => ({local: Object.keys(localStorage), session: Object.keys(sessionStorage), values: Object.values(sessionStorage)}));
  assert.ok(!storage.values.includes(fixture.B.token)); assert.ok(storage.session.includes('issus.csrf')); assert.ok(!page.url().includes(fixture.B.token));
  assert.equal(await page.getByRole('main').count(), 1); assert.equal(await page.getByRole('heading', {level: 1}).count(), 1);
  assert.equal(await page.getByRole('navigation', {name: '주 탐색', exact: true}).count(), 1);
  await page.getByRole('navigation', {name: '주 탐색', exact: true}).getByRole('link', {name: '저장소', exact: true}).click();
  await page.getByRole('list', {name: '저장소', exact: true}).getByRole('link', {name: fixture.repo, exact: true}).click();
  await page.getByRole('table', {name: '이슈 목록', exact: true}).getByRole('link', {name: `#${fixture.number} P8 브라우저 계약`, exact: true}).click();
  await page.getByRole('region', {name: '이슈 현재 상태', exact: true}).waitFor();
  observations.push({id: 'P9-01', identity: {alias: identity.alias, sid: identity.sid}, tokenStored: false});
});

test('P9-02 explicit issuance and confirmed reissue keep tokens out of replay/storage', async () => {
  const code = fixture.A.alias.split('-')[0], alias = `${code}-1-ui${randomBytes(2).toString('hex')}`;
  await operator.write(`/v1/owners/${fixture.repo.split('/')[0]}/aliases`, {method: 'POST', key: randomUUID(), body: {name: alias, role: 'ui', model: 'fixture', scope: 'P9', repos: [fixture.repoId], announcementBody: `FROM:${alias}/by-${code}-system TO:ALL TYPE:ALIAS\n${alias} | ui | fixture | P9 | s1`}});
  await page.goto(server + '/sessions');
  const form = page.getByRole('form', {name: '세션 발급', exact: true});
  await form.getByLabel('관리 토큰', {exact: true}).fill(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN);
  await form.getByLabel('별칭', {exact: true}).fill(alias); await form.getByLabel('세션 ID', {exact: true}).fill('s1');
  const sent = page.waitForRequest(request => new URL(request.url()).pathname === '/v1/sessions' && request.method() === 'POST');
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/sessions' && response.request().method() === 'POST');
  await form.getByRole('button', {name: '발급', exact: true}).click();
  const [request,response] = await Promise.all([sent,responsePromise]); assert.equal(response.status(), 201);
  const metadata = await response.json(); issuedSessions.push(metadata.sessionId);
  const token = page.getByLabel('발급 토큰', {exact: true}); await token.waitFor(); assert.equal(await token.getAttribute('type'), 'password');
  const firstToken = await token.inputValue(); assert.ok(firstToken); assert.equal(await form.getByLabel('관리 토큰', {exact: true}).inputValue(), '');
  await assert.rejects(operator.request('/v1/sessions', {method: 'POST', key: request.headers()['idempotency-key'], body: request.postDataJSON()}), error => {assert.equal(error.status, 409); assert.equal(error.code, 'SESSION_TOKEN_NOT_REPLAYABLE'); assert.ok(!JSON.stringify(error.details).includes(firstToken)); return true;});
  await page.getByRole('button', {name: '세션 재발급 확인', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '세션 재발급 확인', exact: true});
  await dialog.getByLabel('새 세션 ID', {exact: true}).fill('s2'); await dialog.getByLabel('관리 토큰', {exact: true}).fill(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN);
  const reissued = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/sessions' && response.request().method() === 'POST');
  await dialog.getByRole('button', {name: '재발급 실행', exact: true}).click();
  const second = await reissued; assert.equal(second.status(), 201); const next = await second.json(); issuedSessions.push(next.sessionId);
  assert.equal(second.request().postDataJSON().reissueOf, metadata.sessionId); assert.equal(next.sid, 's2');
  await assert.rejects(new IssusClient({server, token: firstToken}).request('/v1/auth/me'), error => error instanceof ClientError && error.status === 401);
  await page.getByRole('button', {name: '발급 토큰 연결', exact: true}).click();
  await eventually(async () => (await page.getByRole('region', {name: '현재 세션', exact: true}).innerText()).includes(alias), 'issued token identity confirmed');
  assert.equal(await page.getByLabel('발급 토큰', {exact: true}).count(), 0);
  observations.push({id: 'P9-02', initialStatus: 201, replayStatus: 409, reissueStatus: 201, previousTokenStatus: 401, sid: next.sid});
});

test('P9-03 complete list STATE/search/sort restore via URL and Q2 state is explicit', async () => {
  await login(page, fixture.B.token);
  await page.goto(`${server}/repos/${fixture.repo}/issues?state=all&workState=running&q=P8&sort=number-asc`);
  await page.getByRole('table', {name: '이슈 목록', exact: true}).waitFor();
  assert.equal(await page.getByLabel('이슈 상태', {exact: true}).inputValue(), 'all');
  assert.equal(await page.getByLabel('작업 STATE', {exact: true}).inputValue(), 'running');
  assert.equal(await page.getByLabel('이슈 검색', {exact: true}).inputValue(), 'P8');
  await page.getByLabel('이슈 검색', {exact: true}).fill('#'+fixture.number); await page.reload();
  assert.equal(await page.getByLabel('이슈 검색', {exact: true}).inputValue(), '#'+fixture.number);
  await page.getByLabel('이슈 상태', {exact: true}).selectOption('closed'); await page.getByRole('status').filter({hasText: '표시할 항목이 없습니다'}).waitFor();
  const disabled = await page.getByLabel('담당 별칭', {exact: true}).isDisabled();
  assert.equal(disabled, false, 'Q2 REPORT6314466185 is connected');
  await page.getByLabel('이슈 상태', {exact: true}).selectOption('all');
  await page.getByLabel('담당 별칭', {exact: true}).fill(fixture.A.alias); await page.getByLabel('참여 별칭', {exact: true}).fill(fixture.B.alias);
  await page.getByLabel('정렬', {exact: true}).selectOption('updated');
  const expected = (await fixture.B.client.request(`/v1/repos/${fixture.repo}/issues?state=all&owner=${fixture.A.alias}&alias=${fixture.B.alias}&q=${encodeURIComponent('#'+fixture.number)}&sort=updated&order=desc`)).data.items.map(item => String(item.number));
  await eventually(async () => JSON.stringify(await page.getByRole('table', {name: '이슈 목록', exact: true}).getByTestId('issue-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-issue-number')))) === JSON.stringify(expected), 'global AND result matches real API');
  observations.push({id: 'P9-03', verdict: 'PASS', q2Complete: !disabled});
});

test('P9-13 ROSTER source remains distinct from registry and alias checks', async () => {
  const current = (await fixture.A.client.request(fixture.path)).data;
  await fixture.A.client.write(fixture.path+'/body', {method: 'PATCH', key: randomUUID(), revision: current.revision, body: {body: current.body+`\nROSTER: ${fixture.A.alias} | author | fixture | P9 | s1 · ${fixture.B.alias} | reader | fixture | P9 | s1`}});
  await page.goto(`${server}/owners/${fixture.repo.split('/')[0]}/aliases?repo=${encodeURIComponent(fixture.repo)}&issue=${fixture.number}`);
  const bodyRegion = page.getByRole('region', {name: /^이슈 본문 ROSTER · revision /}); await bodyRegion.waitFor();
  assert.equal(await bodyRegion.getByRole('table', {name: 'ROSTER', exact: true}).getByTestId('alias-row').count(), 2);
  const check = page.getByRole('form', {name: '별칭 충돌 검사', exact: true}); await check.getByLabel('별칭', {exact: true}).fill(fixture.B.alias); await check.getByRole('button', {name: '별칭 검사', exact: true}).click();
  await check.getByRole('region', {name: '최근 별칭 검사 응답', exact: true}).waitFor(); assert.ok((await check.innerText()).includes('exact'));
  const registry = page.getByRole('table', {name: '별칭 레지스트리', exact: true}); await registry.waitFor();
  await registry.getByRole('button', {name: `별칭 상세 ${fixture.B.alias}`, exact: true}).click();
  const detail = page.getByRole('region', {name: '별칭 상세', exact: true}); await detail.getByRole('term').filter({hasText: '미RELEASE CLAIM 수'}).waitFor();
  await page.getByText('별칭 등록 / 별칭 개명', {exact: true}).click();
  const register = page.getByRole('form', {name: '별칭 등록', exact: true});
  const code = fixture.A.alias.split('-')[0], alias = `${code}-1-ur${randomBytes(2).toString('hex')}`, renamed = `${code}-1-un${randomBytes(2).toString('hex')}`;
  await register.getByLabel('관리 토큰', {exact: true}).fill(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN);
  for (const [label,value] of [['별칭',alias],['역할','review'],['모델','fixture'],['범위','P9'],['저장소 ID(쉼표 구분)',fixture.repoId]]) await register.getByLabel(label, {exact: true}).fill(value);
  await register.getByLabel('ALIAS 공지 원문', {exact: true}).fill(`FROM:${alias}/by-${code}-system TO:ALL TYPE:ALIAS\n${alias} | review | fixture | P9 | s1`);
  const registered = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/owners/${fixture.repo.split('/')[0]}/aliases` && response.request().method() === 'POST');
  await register.getByRole('button', {name: '등록', exact: true}).click(); const registeredResponse = await registered; assert.equal(registeredResponse.status(), 201); const registeredData = await registeredResponse.json();
  await register.getByLabel('관리 토큰', {exact: true}).fill(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN);
  const conflict = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/aliases') && response.request().method() === 'POST');
  await register.getByRole('button', {name: '등록', exact: true}).click(); assert.equal((await conflict).status(), 409);
  await register.getByRole('button', {name: '별칭 개명', exact: true}).click();
  const rename = page.getByRole('form', {name: '별칭 개명', exact: true});
  await rename.getByLabel('관리 토큰', {exact: true}).fill(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN); await rename.getByLabel('별칭 식별자', {exact: true}).fill(registeredData.aliasId); await rename.getByLabel('새 별칭', {exact: true}).fill(renamed);
  await rename.getByLabel('ALIAS 공지 원문', {exact: true}).fill(`FROM:${alias}/by-${code}-system TO:ALL TYPE:ALIAS\n${alias} -> ${renamed}`);
  const renamedResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rename') && response.request().method() === 'POST');
  await rename.getByRole('button', {name: '개명', exact: true}).click(); assert.equal((await renamedResponse).status(), 200);
  await page.getByRole('form', {name: '레지스트리 검색', exact: true}).getByRole('button', {name: '새로고침', exact: true}).click();
  await eventually(async () => (await registry.getByTestId('alias-row').filter({has: page.getByRole('button', {name: `별칭 상세 ${alias}`, exact: true})}).innerText()).includes('renamed'), 'old alias tombstone visible');
  observations.push({id: 'P9-13-registry', verdict: 'PASS', bodyRows: 2, exactCheck: true});
});

test('P9-23 keyboard navigation dialog Escape restores focus at narrow viewport', async () => {
  await page.setViewportSize({width: 800, height: 900}); await page.goto(server+'/repos');
  const trigger = page.getByRole('button', {name: '탐색 열기', exact: true}); await trigger.waitFor(); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {name: '주 탐색', exact: true}); await dialog.waitFor();
  await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  await page.keyboard.press('Escape'); assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.getByRole('main').count(), 1); assert.equal(await page.getByRole('heading', {level: 1}).count(), 1);
  await page.setViewportSize({width: 1440, height: 1000}); observations.push({id: 'P9-23-U1', escapeRestoredFocus: true});
});

async function reconnectDraft(token) {
  const form = page.getByRole('form', {name: '세션 연결', exact: true});
  if (!await form.isVisible()) await page.getByRole('button', {name: '세션 연결', exact: true}).click();
  await form.getByLabel('세션 토큰', {exact: true}).fill(token);
  await form.getByRole('button', {name: '연결', exact: true}).click();
  const completed = page.getByRole('form', {name: '세션 연결', exact: true, includeHidden: true});
  await eventually(() => completed.getByLabel('세션 토큰', {exact: true}).inputValue().then(value => value === ''), 'reconnection bearer erased');
  await eventually(async () => await completed.getAttribute('aria-busy') === 'false', 'reauthentication fully completed');
}
async function expireCookieDraft() {
  await context.clearCookies({name: 'issus_session'});
  const unauthorized = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/auth/me' && response.status() === 401);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await unauthorized;
  await page.getByRole('heading', {level: 1, name: '세션 연결', exact: true}).waitFor();
  assert.equal(await page.getByRole('form', {name: '댓글 작성', exact: true}).count(), 0);
  assert.equal(await page.getByRole('status', {name: '실시간 연결', exact: true}).count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('issus.csrf')), null);
}
async function freshDraftIssue(title) {
  return fixture.write(fixture.A.client, `/v1/repos/${fixture.repo}/issues`, {title, body: `STATE:running OWNER:${fixture.A.alias} UPDATED:${new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')}\nGOAL: session draft boundary`});
}

test('P9-R1 actual Board/Create/Edit/Compact routes render one h1/main and public forms', async () => {
  const {number} = await freshDraftIssue('P9 route assembly');
  await login(page, fixture.A.token);
  for (const [suffix, heading, role, name] of [
    ['board', '공통 게시판', 'region', '공통 게시판'],
    ['issues/new', '이슈 개설', 'form', '이슈 개설'],
    [`issues/${number}/edit`, '본문 편집', 'form', '본문 편집'],
    [`issues/${number}/compact`, 'COMPACT 도우미', 'region', 'COMPACT 도우미'],
  ]) {
    await page.goto(`${server}/repos/${fixture.repo}/${suffix}`);
    await page.getByRole('heading', {level: 1, name: heading, exact: true}).waitFor();
    await page.getByRole(role, {name, exact: true}).waitFor();
    assert.equal(await page.getByRole('main').count(), 1); assert.equal(await page.getByRole('heading', {level: 1}).count(), 1);
    assert.equal(await page.getByText('기능을 준비하고 있습니다', {exact: true}).count(), 0);
  }
  await page.goBack(); await page.getByRole('form', {name: '본문 편집', exact: true}).waitFor();
  await page.goForward(); await page.getByRole('region', {name: 'COMPACT 도우미', exact: true}).waitFor();
  observations.push({id: 'P9-R1', routes: 4, history: true, placeholder: 0});
});

test('P9-R2 real401 keeps comment draft above auth, isolates alias, and restores only by button', async () => {
  const {number} = await freshDraftIssue('P9 comment auth recovery');
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}`);
  const body = `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\n401 이전 원문 초안\n`;
  await page.getByRole('form', {name: '댓글 작성', exact: true}).getByLabel('댓글 본문', {exact: true}).fill(body);
  await expireCookieDraft(); await reconnectDraft(fixture.B.token);
  await page.getByRole('form', {name: '댓글 작성', exact: true}).waitFor();
  assert.equal(await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).count(), 0);
  assert.equal(await page.getByLabel('댓글 본문', {exact: true}).inputValue(), '');
  await reconnectDraft(fixture.A.token);
  const restore = page.getByRole('button', {name: '보관한 초안 복원', exact: true}); await restore.waitFor();
  assert.equal(await page.getByLabel('댓글 본문', {exact: true}).inputValue(), '');
  const writes = []; const observe = request => {if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/comments')) writes.push(request.url());}; page.on('request', observe);
  await restore.click();
  await eventually(async () => await page.getByLabel('댓글 본문', {exact: true}).inputValue() === body, 'exact raw comment restored');
  page.off('request', observe); assert.deepEqual(writes, []);
  const stored = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)]);
  assert.ok(!stored.includes(body)); assert.ok(!stored.includes(fixture.A.token)); assert.ok(!stored.includes(fixture.B.token));
  observations.push({id: 'P9-R2', real401: true, otherAliasRestored: false, automaticRestored: false, posted: 0});
});

test('P9-R3 create title/raw/structured drafts survive real401 and explicit recovery', async () => {
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/new`);
  const form = () => page.getByRole('form', {name: '이슈 개설', exact: true}), title = '재연결 전 개설 제목', body = `STATE:running OWNER:${fixture.A.alias} UPDATED:${new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')}\nGOAL: 재연결 전 작성\n`;
  await form().getByLabel('제목', {exact: true}).fill(title); await form().getByLabel('이슈 본문', {exact: true}).fill(body);
  await form().getByLabel('첫 줄 다음 본문', {exact: true}).fill('아직 원문에 적용하지 않은 구조화 입력');
  await expireCookieDraft(); await reconnectDraft(fixture.A.token);
  await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click();
  await eventually(async () => await form().getByLabel('이슈 본문', {exact: true}).inputValue() === body, 'create raw draft restored');
  assert.equal(await form().getByLabel('제목', {exact: true}).inputValue(), title);
  assert.equal(await form().getByLabel('첫 줄 다음 본문', {exact: true}).inputValue(), '아직 원문에 적용하지 않은 구조화 입력');
  observations.push({id: 'P9-R3', titlePreserved: true, rawPreserved: true, unappliedFieldsPreserved: true});
});

test('P9-R4 edit recovery retains original If-Match baseline and still receives real412', async () => {
  const {number} = await freshDraftIssue('P9 edit auth recovery'), path = issuePath(fixture.repo, number);
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}/edit`);
  const form = () => page.getByRole('form', {name: '본문 편집', exact: true}); await form().waitFor();
  const original = (await fixture.A.client.request(path)).data, body = original.body + '\nmy retained draft';
  await form().getByLabel('이슈 본문', {exact: true}).fill(body); await expireCookieDraft();
  const updated = original.body + '\nserver changed during authentication';
  await fixture.A.client.write(path + '/body', {method: 'PATCH', key: randomUUID(), revision: original.revision, body: {body: updated}});
  await reconnectDraft(fixture.A.token); await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click();
  await eventually(async () => await form().getByLabel('이슈 본문', {exact: true}).inputValue() === body, 'edit draft restored');
  const response = page.waitForResponse(response => new URL(response.url()).pathname === path + '/body' && response.request().method() === 'PATCH');
  await form().getByRole('button', {name: '본문 저장', exact: true}).click(); const stale = await response;
  assert.equal(stale.status(), 412); assert.equal(stale.request().headers()['if-match'], `"${original.revision}"`);
  await page.getByRole('region', {name: '최신 서버 원문', exact: true}).waitFor();
  assert.equal(await form().getByLabel('이슈 본문', {exact: true}).inputValue(), body);
  assert.equal((await fixture.A.client.request(path)).data.body, updated);
  observations.push({id: 'P9-R4', real412: true, originalRevision: original.revision, staleOverwrite: false});
});

test('P9-R5 COMPACT draft survives real401 while packet token and accepted samples require fresh review', async () => {
  const {number} = await freshDraftIssue('P9 compact auth recovery'), path = issuePath(fixture.repo, number);
  await fixture.write(fixture.A.client, path + '/comments', {body: `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\nsource for recovery`});
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}/compact`);
  const prepare = page.waitForResponse(response => new URL(response.url()).pathname === path + '/compact/prepare' && response.request().method() === 'POST');
  await page.getByRole('button', {name: '패킷 준비', exact: true}).click(); const packet = await (await prepare).json();
  const sample = packet.comments[0].id;
  await page.getByRole('button', {name: `원문 대조 ${sample}`, exact: true}).click();
  await page.getByRole('dialog', {name: `표본 원문 ${sample}`, exact: true}).waitFor();
  await page.getByRole('button', {name: '대조 원문 닫기', exact: true}).click(); await page.getByLabel(`표본 대조 ${sample}`, {exact: true}).check();
  const body = `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${packet.throughId}\n## ===== COMPACT #${number} through ${packet.throughId} =====\n보존할 사람 요약\ncompacted-by:${fixture.A.alias}`;
  await page.getByLabel('COMPACT 본문', {exact: true}).fill(body); await page.getByLabel('요약 담당 별칭', {exact: true}).fill(fixture.A.alias);
  await expireCookieDraft(); await reconnectDraft(fixture.A.token); await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click();
  await eventually(async () => await page.getByLabel('COMPACT 본문', {exact: true}).inputValue() === body, 'COMPACT raw draft restored');
  assert.equal(await page.getByLabel('요약 담당 별칭', {exact: true}).inputValue(), fixture.A.alias);
  assert.equal(await page.getByRole('button', {name: '패킷 다운로드', exact: true}).isDisabled(), true);
  assert.equal(await page.getByRole('button', {name: 'COMPACT 게시', exact: true}).isDisabled(), true);
  assert.equal(await page.getByLabel(`표본 대조 ${sample}`, {exact: true}).count(), 0);
  assert.ok(!(await page.getByRole('main').innerText()).includes(packet.packetToken));
  observations.push({id: 'P9-R5', bodyPreserved: true, packetRestored: false, acceptedSamplesRestored: false});
});

async function draftCommentCount(number) {
  return (await fixture.pool.query(`SELECT count(*)::int AS n FROM "${fixture.schema}".comment WHERE repo_id=$1 AND issue_number=$2`, [fixture.repoId, number])).rows[0].n;
}
async function recoveryAsk(number, text) {
  return fixture.write(fixture.B.client, issuePath(fixture.repo, number) + '/comments', {body: `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK ACK-BY:${new Date(Date.now()+3600000).toISOString().replace(/\.\d{3}Z$/, '+00:00')}\nASK @${fixture.A.alias}: ${text}`});
}

test('P9-R7 HANDOFF fields survive real401 and explicit restore requires target recheck', async () => {
  const {number} = await freshDraftIssue('P9 HANDOFF recovery'), target = await freshDraftIssue('P9 HANDOFF destination');
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}`);
  const dialog = () => page.getByRole('dialog', {name: '이관', exact: true});
  const open = async () => {await page.getByRole('button', {name: '이관', exact: true}).click(); await eventually(async () => await dialog().getByLabel('TO', {exact: true}).isEnabled(), 'HANDOFF refresh finished');};
  await open();
  const deadline = new Date(Date.now()+3600000).toISOString().replace(/\.\d{3}Z$/, '+00:00'), text = '인증 만료 전 이관 결과·남은 질문\n그대로 보존', deferred = '현재 복원 시험 중 요약 보류';
  for (const [label,value] of [['TO',fixture.B.alias],['ACK-BY',deadline],['REPLY-IN',`#${target.number}`],['결과·근거·남은 질문·자원·승인 경계',text],['compactDeferredReason',deferred]]) await dialog().getByLabel(label, {exact: true}).fill(value);
  await dialog().getByRole('button', {name: '후속 이슈 확인', exact: true}).click();
  await eventually(async () => await dialog().getByRole('button', {name: 'HANDOFF 게시', exact: true}).isEnabled(), 'target checked before expiry');
  const before = await draftCommentCount(number);
  await expireCookieDraft(); await reconnectDraft(fixture.A.token); await open();
  assert.equal(await dialog().getByLabel('TO', {exact: true}).inputValue(), '');
  assert.equal(await dialog().getByLabel('결과·근거·남은 질문·자원·승인 경계', {exact: true}).inputValue(), '');
  await dialog().getByRole('button', {name: '이관 닫기', exact: true}).click();
  await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click(); await open();
  for (const [label,value] of [['TO',fixture.B.alias],['ACK-BY',deadline],['REPLY-IN',`#${target.number}`],['결과·근거·남은 질문·자원·승인 경계',text],['compactDeferredReason',deferred]]) assert.equal(await dialog().getByLabel(label, {exact: true}).inputValue(), value);
  assert.equal(await dialog().getByRole('button', {name: 'HANDOFF 게시', exact: true}).isDisabled(), true);
  assert.equal(await dialog().getByText('후속 이슈를 확인했습니다', {exact: true}).count(), 0);
  await dialog().getByRole('button', {name: '후속 이슈 확인', exact: true}).click();
  await eventually(async () => await dialog().getByRole('button', {name: 'HANDOFF 게시', exact: true}).isEnabled(), 'restored target explicitly rechecked');
  assert.equal(await draftCommentCount(number), before);
  await dialog().getByRole('button', {name: '이관 닫기', exact: true}).click();
  observations.push({id: 'P9-R7', real401: true, samePrincipal: true, automaticRestored: false, fieldsRestored: 5, targetRechecked: true, posted: 0});
});

test('P9-R8 quick ACK real401 restores edited raw body only for its original comment', async () => {
  const {number} = await freshDraftIssue('P9 quick ACK recovery'), first = await recoveryAsk(number, '첫 댓글'), second = await recoveryAsk(number, '다른 댓글');
  await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}`);
  const dialog = () => page.getByRole('dialog', {name: '수신 확인 미리보기', exact: true});
  const open = async id => {await page.getByRole('article', {name: `댓글 ${id}`, exact: true}).getByRole('button', {name: '수신 확인 작성', exact: true}).click(); await dialog().waitFor();};
  const body = `FROM:${fixture.A.alias}/s1 TO:${fixture.B.alias} TYPE:ACK RE:${first.commentId}\n수정한 ACK 원문\n끝 공백  \n`;
  await open(first.commentId); await dialog().getByLabel('ACK 본문', {exact: true}).fill(body);
  const before = await draftCommentCount(number);
  await expireCookieDraft(); await reconnectDraft(fixture.A.token); await open(first.commentId);
  assert.notEqual(await dialog().getByLabel('ACK 본문', {exact: true}).inputValue(), body);
  await dialog().getByRole('button', {name: '취소', exact: true}).click();
  await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click();
  await open(second.commentId); assert.ok(!(await dialog().getByLabel('ACK 본문', {exact: true}).inputValue()).includes('수정한 ACK 원문'));
  await dialog().getByRole('button', {name: '취소', exact: true}).click(); await open(first.commentId);
  assert.equal(await dialog().getByLabel('ACK 본문', {exact: true}).inputValue(), body);
  assert.equal(await draftCommentCount(number), before);
  await dialog().getByRole('button', {name: '취소', exact: true}).click();
  observations.push({id: 'P9-R8', real401: true, samePrincipal: true, automaticRestored: false, otherCommentRestored: false, posted: 0});
});

test('P9-R9 inbox ACK real401 restores edited content only for its original issue and comment', async () => {
  const {number} = await freshDraftIssue('P9 inbox ACK recovery'), otherIssue = await freshDraftIssue('P9 inbox other issue');
  const first = await recoveryAsk(number, '복원할 inbox 댓글'), second = await recoveryAsk(number, '같은 이슈 다른 댓글'), third = await recoveryAsk(otherIssue.number, '다른 이슈 댓글');
  await login(page, fixture.A.token, `/inbox?repo=${fixture.repo}&issues=${number},${otherIssue.number}`);
  const item = id => page.getByTestId('delivery').filter({has: page.getByRole('heading', {level: 2, name: `ME · ${id}`, exact: true})});
  const dialog = () => page.getByRole('dialog', {name: '수신 확인 미리보기', exact: true});
  const open = async id => {await item(id).getByRole('button', {name: '수신 확인 작성', exact: true}).click(); await dialog().waitFor();};
  const content = 'inbox에서 편집한 ACK\n줄바꿈·끝 공백  \n';
  await open(first.commentId); await dialog().getByLabel('ACK 내용', {exact: true}).fill(content);
  const before = await draftCommentCount(number), otherBefore = await draftCommentCount(otherIssue.number);
  await expireCookieDraft(); await reconnectDraft(fixture.A.token); await open(first.commentId);
  assert.notEqual(await dialog().getByLabel('ACK 내용', {exact: true}).inputValue(), content);
  await dialog().getByRole('button', {name: '취소', exact: true}).click();
  await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).click();
  for (const id of [second.commentId, third.commentId]) {await open(id); assert.notEqual(await dialog().getByLabel('ACK 내용', {exact: true}).inputValue(), content); await dialog().getByRole('button', {name: '취소', exact: true}).click();}
  await open(first.commentId); assert.equal(await dialog().getByLabel('ACK 내용', {exact: true}).inputValue(), content);
  assert.equal(await draftCommentCount(number), before); assert.equal(await draftCommentCount(otherIssue.number), otherBefore);
  await dialog().getByRole('button', {name: '취소', exact: true}).click();
  observations.push({id: 'P9-R9', real401: true, samePrincipal: true, automaticRestored: false, otherCommentRestored: false, otherIssueRestored: false, posted: 0});
});

test('P9-R6 actual expiry timer preserves draft and explicit discard never restores it', async () => {
  // Only the browser's wall clock advances; auth/me and all API payloads remain real.
  await page.close(); page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
  const identity = (await fixture.A.client.request('/v1/auth/me')).data;
  await page.clock.install({time: new Date(new Date(identity.expiresAt).getTime() - 60000)});
  try {
    const {number} = await freshDraftIssue('P9 expiry timer');
    await login(page, fixture.A.token, `/repos/${fixture.repo}/issues/${number}`);
    const body = `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\n만료 타이머 전 초안`;
    await page.getByLabel('댓글 본문', {exact: true}).fill(body);
    await page.clock.fastForward(61000);
    await page.getByRole('heading', {level: 1, name: '세션 연결', exact: true}).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('issus.csrf')), null);
    assert.equal(await page.getByRole('status', {name: '실시간 연결', exact: true}).count(), 0);
    await page.clock.setSystemTime(new Date()); await reconnectDraft(fixture.A.token);
    await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).waitFor();
    assert.equal(await page.getByLabel('댓글 본문', {exact: true}).inputValue(), '');
    await page.getByRole('button', {name: '보관한 초안 버리기', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: '보관한 초안 복원', exact: true}).count(), 0);
    assert.equal(await page.getByLabel('댓글 본문', {exact: true}).inputValue(), '');
    observations.push({id: 'P9-R6', actualExpiryTimer: true, automaticRestore: false, discarded: true});
  } finally {
    await page.close(); page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    await login(page, fixture.B.token);
  }
});

test('P9-24 dark tokens/computed contrast and new-tab CSRF require reauthentication', async () => {
  await page.goto(server+'/repos');
  const computed = await page.evaluate(() => {
    const root = document.documentElement, style = getComputedStyle(root), code = document.createElement('code'); code.textContent = 'STATE:running'; document.querySelector('main').append(code);
    const c = getComputedStyle(code), result = {theme: root.dataset.theme, font: style.fontSize, radius: style.getPropertyValue('--ui-radius').trim(), shadow: style.getPropertyValue('--ui-shadow').trim(), fg: c.color, bg: c.backgroundColor}; code.remove(); return result;
  });
  const luminance = rgb => rgb.match(/\d+/g).slice(0,3).map(Number).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,index) => sum+v*[.2126,.7152,.0722][index], 0);
  const a = luminance(computed.fg), b = luminance(computed.bg), contrast = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.equal(computed.theme, 'dark'); assert.equal(computed.font, '14px'); assert.equal(computed.radius, '8px'); assert.equal(computed.shadow, 'none'); assert.ok(contrast >= 4.5);
  for (const width of [1440,1200,900]) {await page.setViewportSize({width,height:1000}); await page.screenshot({path: fileURLToPath(new URL('dark-'+width+'.png', output)), fullPage: true});}
  const tab = await context.newPage(); await tab.goto(`${server}/repos/${fixture.repo}/issues/${fixture.number}`);
  await tab.getByRole('form', {name: '댓글 작성', exact: true}).waitFor(); assert.equal(await tab.evaluate(() => sessionStorage.getItem('issus.csrf')), null);
  await tab.getByRole('status').filter({hasText: '쓰기 전에 세션 토큰을 다시 연결해 주세요'}).waitFor();
  await tab.close();
  await operator.write('/v1/sessions/'+fixture.B.sessionId, {method: 'DELETE', key: randomUUID()}); await page.reload();
  await page.getByRole('heading', {level: 1, name: '세션 연결', exact: true}).waitFor(); assert.equal(await page.getByText('실시간 연결됨', {exact: true}).count(), 0);
  observations.push({id: 'P9-24-U1', ...computed, contrast, csrfNewTab: false, revokedRequiresReauthentication: true});
});
