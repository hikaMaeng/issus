import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {ClientError} from 'issus_domain/front';
import {eventually, provisionBrowserFixture} from './fixture.mjs';

const server = process.env.ISSUS_TEST_SERVER_URL;
assert.ok(server, 'ISSUS_TEST_SERVER_URL required: browser tests only use a deployed target');
const output = new URL('../../../../.cache/p8/browser/', import.meta.url);
let browser, context, page, fixture;
const pageErrors = [], responses = [], recovery = [];
async function login(target, token) {
  await target.goto(server + '/repos');
  await target.getByLabel('세션 토큰', {exact: true}).fill(token);
  await target.getByRole('button', {name: '연결', exact: true}).click();
  await eventually(() => target.getByRole('heading', {level: 1, name: '저장소', exact: true}).count(), 'login');
}
async function issue() {
  await page.goto(`${server}/repos/${fixture.repo}/issues/${fixture.number}`);
  await page.getByRole('region', {name: '이슈 현재 상태', exact: true}).waitFor();
  await page.getByRole('article', {name: `댓글 ${fixture.after}`, exact: true}).waitFor();
}

before(async () => {
  const {chromium} = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT
    ? createRequire(resolve(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, 'package.json'))('playwright')
    : await import('playwright');
  await mkdir(output, {recursive: true});
  fixture = await provisionBrowserFixture();
  browser = await chromium.launch({headless: true});
  context = await browser.newContext(); page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {const url = new URL(response.url()); if (url.pathname.startsWith('/v1/')) responses.push({path: url.pathname, status: response.status()});});
  await login(page, fixture.B.token);
});
afterEach(async t => {
  if (['B-03-2', 'B-03-4', 'B-03-5'].some(id => t.name.startsWith(id))) return;
  const filename = t.name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 160) + '.png';
  if (page) await page.screenshot({path: fileURLToPath(new URL(filename, output)), fullPage: true});
});
after(async () => {
  await context?.close(); await browser?.close(); await fixture?.cleanup();
  await mkdir(output, {recursive: true});
  await writeFile(new URL('observed.json', output), JSON.stringify({timestamp: new Date().toISOString(), server, browserLaunched: !!browser, fixtureProvisioned: !!fixture, schema: fixture?.schema, brokerSchema: fixture?.brokerSchema, pageErrors, responses, recovery}, null, 2)+'\n');
  assert.deepEqual(pageErrors, []);
});

test('B-01-1 deployed issue list: main/navigation/table and stable row', async () => {
  await page.goto(`${server}/repos/${fixture.repo}/issues`);
  const table = page.getByRole('table', {name: '이슈 목록', exact: true}); await table.waitFor();
  assert.equal(await page.getByRole('main').count(), 1); assert.equal(await page.getByRole('heading', {level: 1}).count(), 1);
  assert.equal(await page.getByRole('navigation', {name: '주 탐색', exact: true}).count(), 1);
  const row = table.getByTestId('issue-row').filter({has: page.getByRole('link', {name: `#${fixture.number} P8 브라우저 계약`, exact: true})});
  assert.equal(await row.count(), 1); assert.equal(await row.getAttribute('data-issue-number'), String(fixture.number));
  await row.getByRole('link', {name: `#${fixture.number} P8 브라우저 계약`, exact: true}).click();
  await page.getByRole('region', {name: '이슈 현재 상태', exact: true}).waitFor();
});
test('B-01-2 issue envelope is an actual definition list', async () => {
  await issue();
  const region = page.getByRole('region', {name: '이슈 현재 상태', exact: true});
  assert.equal(await region.evaluate(element => element.getElementsByTagName('dl').length), 1);
  for (const key of ['STATE','OWNER','UPDATED','COMPACT','BOARD']) assert.equal(await region.getByRole('term').filter({hasText: new RegExp('^'+key+'$')}).count(), 1);
  const comment = page.getByRole('article', {name: `댓글 ${fixture.after}`, exact: true});
  assert.equal(await comment.getAttribute('data-testid'), 'comment');
  assert.equal(await comment.evaluate(element => element.getElementsByTagName('dl').length), 1);
  assert.equal(await comment.getByRole('term').filter({hasText: /^FROM$/}).count(), 1);
  await comment.getByRole('button', {name: '원문 보기', exact: true}).click();
});
test('B-01-3 legacy NOENV is a visible warning and raw HTML stays inert', async () => {
  await issue();
  const legacy = page.getByRole('article', {name: `댓글 ${fixture.legacy}`, exact: true});
  await legacy.waitFor(); assert.equal(await legacy.getByRole('alert').innerText(), '[NOENV] 봉투가 없어 실행할 수 없습니다');
  assert.equal(await page.evaluate(() => window.legacyExecuted), undefined);
});
test('B-01-4 latest COMPACT is the default boundary; full toggle expands older comments', async () => {
  await issue();
  const marker = page.getByTestId('compact-marker'); await marker.waitFor();
  assert.equal(await marker.getAttribute('role'), null); assert.equal(await marker.evaluate(element => element.tagName), 'H2');
  assert.ok((await marker.innerText()).startsWith('## ===== COMPACT #'));
  assert.equal(await page.getByRole('article', {name: `댓글 ${fixture.before}`, exact: true}).count(), 0);
  const toggle = page.getByRole('button', {name: '전체 댓글 보기', exact: true}); assert.equal(await toggle.getAttribute('aria-expanded'), 'false'); await toggle.click();
  await page.getByRole('article', {name: `댓글 ${fixture.before}`, exact: true}).waitFor();
  const collapse = page.getByRole('button', {name: '최신 COMPACT 이후 보기', exact: true}); assert.equal(await collapse.getAttribute('aria-expanded'), 'true'); await collapse.click();
  await page.getByRole('article', {name: `댓글 ${fixture.after}`, exact: true}).waitFor();
  assert.equal(await page.getByRole('article', {name: `댓글 ${fixture.before}`, exact: true}).count(), 0);
});
test('B-02-1 inbox ASK receipt then explicit ACK preview, acked and applied after refresh', async () => {
  await page.goto(`${server}/inbox?repo=${fixture.repo}&issues=${fixture.number}`);
  const item = page.getByRole('region', {name: '받은편지함', exact: true}).getByRole('article', {name: `전달 ${fixture.delivery.id}`, exact: true});
  await item.waitFor();
  await eventually(async () => (await item.innerText()).includes('delivered'), 'transport receipt visible');
  await item.getByRole('button', {name: '수신 확인 작성', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '수신 확인 미리보기', exact: true}); await dialog.waitFor();
  const preview = await dialog.innerText(); assert.ok(preview.includes(`RE:${fixture.ask}`));
  const before = (await fixture.B.client.request(`/v1/inbox?repo=${fixture.repo}&issues=${fixture.number}`)).data.items.find(row => row.commentId === fixture.ask);
  assert.equal(before.delivery.state, 'delivered', 'preview has not posted ACK');
  await dialog.getByRole('button', {name: 'ACK 게시', exact: true}).click();
  await eventually(async () => (await item.innerText()).includes('acked'), 'acked visible');
  const report = await fixture.post(`FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:REPORT STATE:done RE:${fixture.ask}\n브라우저 적용 근거.\nNEXT: complete.`, fixture.B.client);
  await fixture.write(fixture.B.client, '/v1/deliveries/'+fixture.delivery.id+'/application', {evidenceCommentId: report.commentId, outcome: 'applied'});
  await page.getByRole('button', {name: '새로고침', exact: true}).click();
  await eventually(async () => (await item.innerText()).includes('applied'), 'applied visible');
  await page.reload(); await item.waitFor(); assert.ok((await item.innerText()).includes('applied'));
});
test('B-02-2 composer displays identical ordered HTTP422 reasons and posts no invalid comment', async () => {
  await issue();
  const body = `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK\nACK-BY가 빠진 잘못된 요청`;
  let expected;
  try {await fixture.B.client.request(fixture.path+'/preflight', {method: 'POST', body: {mode: 'comment', request: {body}}}); assert.fail('invalid ASK accepted');}
  catch (error) {assert.ok(error instanceof ClientError); assert.equal(error.status, 422); expected = error.reasons;}
  const before = (await fixture.pool.query(`SELECT count(*)::int AS n FROM "${fixture.schema}".comment WHERE repo_id=$1 AND issue_number=$2`, [fixture.repoId, fixture.number])).rows[0].n;
  const form = page.getByRole('form', {name: '댓글 작성', exact: true}), textarea = form.getByLabel('댓글 본문', {exact: true});
  await textarea.fill(body);
  for (const name of ['검사','게시']) {
    const response = page.waitForResponse(value => value.url().endsWith(fixture.path+(name === '검사' ? '/preflight' : '/comments')) && value.status() === 422);
    await form.getByRole('button', {name, exact: true}).click(); await response;
    const alert = form.getByRole('alert'); await alert.waitFor(); assert.deepEqual(await alert.getByRole('paragraph').allTextContents(), expected);
    assert.equal(await textarea.getAttribute('aria-invalid'), 'true'); assert.equal(await textarea.getAttribute('aria-describedby'), 'composer-errors');
  }
  assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM "${fixture.schema}".comment WHERE repo_id=$1 AND issue_number=$2`, [fixture.repoId, fixture.number])).rows[0].n, before);
});
test('B-03-1 empty issue filter exposes a positive status', async () => {
  await page.goto(`${server}/repos/${fixture.repo}/issues`);
  await page.getByLabel('이슈 상태', {exact: true}).selectOption('closed');
  await eventually(async () => (await page.getByRole('status').allTextContents()).includes('표시할 항목이 없습니다'), 'empty state');
});
test('B-02-3 valid ASK posts through composer and its own canonical comment survives reload', async () => {
  await issue();
  const deadline = new Date(Date.now()+600000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const body = `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK ACK-BY:${deadline}\nASK @${fixture.A.alias}: 작성기 성공 확인.\nNEXT: 검토.`;
  const form = page.getByRole('form', {name: '댓글 작성', exact: true});
  await form.getByLabel('댓글 본문', {exact: true}).fill(body);
  await form.getByRole('button', {name: '검사', exact: true}).click();
  await eventually(async () => (await form.getByRole('status').allTextContents()).includes('검사를 통과했습니다'), 'valid preflight');
  await form.getByRole('button', {name: '게시', exact: true}).click();
  const success = form.getByRole('status').filter({hasText: /^댓글 \d+ 게시됨$/}); await success.waitFor();
  const id = (await success.innerText()).match(/\d+/)[0];
  await page.getByRole('article', {name: `댓글 ${id}`, exact: true}).waitFor();
  await page.reload(); await page.getByRole('article', {name: `댓글 ${id}`, exact: true}).waitFor();
});
test('B-03-2 close blockers stay in a named native dialog', async () => {
  const ownerContext = await browser.newContext(), ownerPage = await ownerContext.newPage();
  ownerPage.on('pageerror', error => pageErrors.push(error.message));
  try {
    await login(ownerPage, fixture.A.token); await ownerPage.goto(`${server}/repos/${fixture.repo}/issues/${fixture.number}`);
    await ownerPage.getByRole('button', {name: '이슈 닫기', exact: true}).click();
    const dialog = ownerPage.getByRole('dialog', {name: '이슈 닫기 확인', exact: true});
    await dialog.getByLabel('최종 REPORT id', {exact: true}).fill(fixture.finalReport); await dialog.getByLabel('닫기 사유', {exact: true}).fill('차단 항목 확인');
    await dialog.getByRole('button', {name: '닫기 실행', exact: true}).click();
    await dialog.getByRole('alert').waitFor(); assert.ok((await dialog.getByRole('alert').innerText()).includes('CLOSE_BLOCKED'));
    assert.ok((await dialog.getByRole('alert').innerText()).includes(fixture.compact));
    await ownerPage.screenshot({path: fileURLToPath(new URL('B-03-2-close-blockers.png', output)), fullPage: true});
    await dialog.getByRole('button', {name: '취소', exact: true}).click();
  } finally {await ownerContext.close();}
});

test('B-03-3 loading is visible and busy until the deployed list request completes', async () => {
  const endpoint = new URL(`/v1/repos/${fixture.repo}/issues`, server).pathname;
  let release, requested = false;
  const gate = new Promise(resolve => {release = resolve;});
  const match = url => url.pathname === endpoint;
  const hold = async route => {requested = true; await gate; await route.continue();};
  await page.route(match, hold);
  try {
    await page.goto(`${server}/repos/${fixture.repo}/issues`, {waitUntil: 'domcontentloaded'});
    await eventually(() => requested, 'real list request held');
    const loading = page.getByRole('status').filter({hasText: /^불러오는 중$/});
    await loading.waitFor(); assert.equal(await loading.getAttribute('aria-busy'), 'true');
    assert.equal(await page.getByRole('table', {name: '이슈 목록', exact: true}).count(), 0);
    await page.screenshot({path: fileURLToPath(new URL('B-03-3-loading.png', output)), fullPage: true});
    release();
    await page.getByRole('table', {name: '이슈 목록', exact: true}).waitFor();
    assert.equal(await loading.count(), 0);
  } finally {release(); await page.unroute(match, hold);}
});

test('B-03-4 exhausted WS connections expose an alert with no false connected status', {timeout: 45000}, async () => {
  const offlineContext = await browser.newContext(), target = await offlineContext.newPage();
  target.on('pageerror', error => pageErrors.push(error.message));
  let attempts = 0;
  try {
    await login(target, fixture.B.token);
    await target.routeWebSocket('**/ws', async socket => {attempts++; await socket.close({code: 1013, reason: 'P8 connection unavailable'});});
    await target.goto(`${server}/inbox?repo=${fixture.repo}&issues=${fixture.number}`);
    const error = target.getByRole('alert', {name: '실시간 연결', exact: true});
    await error.waitFor(); assert.equal(await error.innerText(), '실시간 연결 오류');
    assert.equal(attempts, 5, 'initial attempt plus four bounded reconnects');
    assert.equal(await target.getByRole('status', {name: '실시간 연결', exact: true}).count(), 0);
    await target.getByRole('region', {name: '받은편지함', exact: true}).getByTestId('delivery').filter({has: target.getByRole('heading', {name: `ME · ${fixture.ask}`, exact: true})}).waitFor();
    recovery.push({scenario: 'B-03-4', attempts, error: await error.innerText()});
    await target.screenshot({path: fileURLToPath(new URL('B-03-4-connection-error.png', output)), fullPage: true});
  } finally {await offlineContext.close();}
});

test('B-03-5 actual WS disconnect/reconnect replays missed delivery with zero duplicate rows', {timeout: 60000}, async () => {
  const reconnectContext = await browser.newContext(), target = await reconnectContext.newPage();
  target.on('pageerror', error => pageErrors.push(error.message));
  const links = [], subscriptionIds = [], frames = [];
  let block = false, waiting = false, release, duplicateFrames = 0, replayedComment;
  const gate = new Promise(resolve => {release = resolve;});
  try {
    await login(target, fixture.B.token);
    await target.route('**/v1/subscriptions', async route => {
      if (block && route.request().method() === 'POST') {waiting = true; await gate;}
      await route.continue();
    });
    await target.routeWebSocket('**/ws', socket => {
      const upstream = socket.connectToServer(); links.push({socket, upstream});
      upstream.onMessage(message => {
        const frame = JSON.parse(String(message));
        if (frame.type === 'subscribed') subscriptionIds.push(frame.subscriptionId);
        if (frame.type === 'event') frames.push({action: frame.event.action, commentId: frame.event.payload.commentId});
        socket.send(message);
        // Re-send the real deployed frame once; no fixture payload replaces server data.
        if (frame.type === 'event' && frame.event.payload.commentId === replayedComment && duplicateFrames === 0) {socket.send(message); duplicateFrames++;}
      });
    });
    await target.goto(`${server}/inbox?repo=${fixture.repo}&issues=${fixture.number}`);
    const status = target.getByRole('status', {name: '실시간 연결', exact: true});
    await eventually(async () => (await status.innerText()) === '실시간 연결됨', 'initial WS subscribed');
    const region = target.getByRole('region', {name: '받은편지함', exact: true});
    await region.getByRole('article', {name: `전달 ${fixture.delivery.id}`, exact: true}).waitFor();
    block = true;
    await links[0].socket.close({code: 1013, reason: 'P8 transient disconnect'});
    await links[0].upstream.close({code: 1013, reason: 'P8 transient disconnect'});
    await eventually(async () => (await status.innerText()) === '실시간 재연결 대기 중', 'disconnect visible');
    await eventually(() => waiting, 'new subscription held before reconnect');
    await target.screenshot({path: fileURLToPath(new URL('B-03-5-disconnected.png', output)), fullPage: true});
    const posted = await fixture.post(`FROM:${fixture.A.alias}/s1 TO:${fixture.B.alias} TYPE:NOTE\nB-03 단절 중 게시한 실제 전달.`);
    replayedComment = posted.commentId;
    const missed = await eventually(async () => (await fixture.B.client.request(`/v1/inbox?repo=${fixture.repo}&issues=${fixture.number}`)).data.items.find(item => item.commentId === posted.commentId)?.delivery, 'missed delivery persisted');
    block = false; release();
    await eventually(async () => (await status.innerText()) === '실시간 연결됨' && subscriptionIds.length >= 2, 'reconnected WS subscribed');
    assert.notEqual(subscriptionIds[0], subscriptionIds[1], 'closed subscription id must be replaced');
    await eventually(() => frames.some(frame => frame.commentId === posted.commentId), 'missed delivery replayed by real server');
    assert.equal(duplicateFrames, 1, 'real frame duplicate was exercised');
    const item = region.getByRole('article', {name: `전달 ${missed.id}`, exact: true}); await item.waitFor();
    await eventually(async () => (await item.innerText()).includes('delivered'), 'replayed delivery receipt persisted and visible');
    await target.getByRole('button', {name: '새로고침', exact: true}).click();
    await eventually(async () => (await item.innerText()).includes('delivered'), 'refresh after reconnect');
    const identities = await region.getByTestId('delivery').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
    const duplicates = identities.length - new Set(identities).size;
    assert.ok(identities.length > 0); assert.equal(duplicates, 0); assert.equal(await item.count(), 1);
    assert.equal(await region.getByRole('article', {name: `전달 ${fixture.delivery.id}`, exact: true}).count(), 1);
    recovery.push({scenario: 'B-03-5', connections: links.length, subscriptionIds, missedCommentId: posted.commentId, duplicateFrames, rows: identities.length, duplicateRows: duplicates});
    await target.screenshot({path: fileURLToPath(new URL('B-03-5-reconnected.png', output)), fullPage: true});
  } finally {release(); await reconnectContext.close();}
});
