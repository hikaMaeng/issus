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
  await target.getByRole('heading', {level: 1, name: /^(저장소|세션 연결)$/}).waitFor();
  if (!await target.getByLabel('세션 토큰', {exact: true}).isVisible()) await target.getByRole('button', {name: '세션 연결', exact: true}).click();
  await target.getByLabel('세션 토큰', {exact: true}).fill(token);
  await target.getByRole('button', {name: '연결', exact: true}).click();
  await eventually(() => target.getByLabel('세션 토큰', {exact: true}).inputValue().then(value => value === ''), 'bearer erased');
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
