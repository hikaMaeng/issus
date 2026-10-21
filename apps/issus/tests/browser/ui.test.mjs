import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ClientError} from 'issus_domain/front';
import {eventually, provisionBrowserFixture} from './fixture.mjs';

const server = process.env.ISSUS_TEST_SERVER_URL;
assert.ok(server, 'ISSUS_TEST_SERVER_URL required: browser tests only use a deployed target');
const output = new URL('../../../../.cache/p8/browser/', import.meta.url);
let browser, context, page, fixture;
const pageErrors = [], responses = [];
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
  const {chromium} = await import('playwright');
  await mkdir(output, {recursive: true});
  fixture = await provisionBrowserFixture();
  browser = await chromium.launch({headless: true});
  context = await browser.newContext(); page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {const url = new URL(response.url()); if (url.pathname.startsWith('/v1/')) responses.push({path: url.pathname, status: response.status()});});
  await login(page, fixture.B.token);
});
afterEach(async t => {
  if (t.name.startsWith('B-03-2')) return;
  const filename = t.name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 160) + '.png';
  if (page) await page.screenshot({path: fileURLToPath(new URL(filename, output)), fullPage: true});
});
after(async () => {
  await context?.close(); await browser?.close(); await fixture?.cleanup();
  await mkdir(output, {recursive: true});
  await writeFile(new URL('observed.json', output), JSON.stringify({timestamp: new Date().toISOString(), server, browserLaunched: !!browser, fixtureProvisioned: !!fixture, schema: fixture?.schema, brokerSchema: fixture?.brokerSchema, pageErrors, responses}, null, 2)+'\n');
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
