import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {ClientError, issuePath} from 'issus_domain/front';
import {eventually, provisionBrowserFixture} from './fixture.mjs';

const server = process.env.ISSUS_TEST_SERVER_URL;
assert.ok(server, 'ISSUS_TEST_SERVER_URL required: production assets on an isolated deployed target only');
const output = new URL('../../../../.cache/p9-u2/browser/', import.meta.url);
let browser, fixture, ownerContext, readerContext, ownerPage, page;
const observations = [], pageErrors = [], responses = [];
const iso = date => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
const future = (ms = 300000) => iso(new Date(Date.now() + ms));
const ui = number => `${server}/repos/${fixture.repo}/issues/${number}`;
const form = target => target.getByRole('form', {name: '댓글 작성', exact: true});
const article = (target, id) => target.getByRole('article', {name: `댓글 ${id}`, exact: true});
async function login(target, token) {
  await target.goto(server + '/login?returnTo=/repos');
  await target.getByRole('heading', {level: 1, name: '세션 연결', exact: true}).waitFor();
  if (!await target.getByLabel('세션 토큰', {exact: true}).isVisible()) await target.getByRole('button', {name: '세션 연결', exact: true}).click();
  await target.getByLabel('세션 토큰', {exact: true}).fill(token);
  await target.getByRole('button', {name: '연결', exact: true}).click();
  await target.waitForURL(server + '/repos');
  await target.getByRole('heading', {level: 1, name: '저장소', exact: true}).waitFor();
}
async function open(target, number = fixture.number) {await target.goto(ui(number)); await target.getByRole('region', {name: '이슈 현재 상태', exact: true}).waitFor(); await form(target).waitFor();}
async function newIssue(actor = fixture.A, title = 'U2 ' + randomUUID()) {
  return fixture.write(actor.client, `/v1/repos/${fixture.repo}/issues`, {title, body: `STATE:running OWNER:${actor.alias} UPDATED:${future(0)}\nGOAL: U2 deployed acceptance\nSCOPE: U2\nNON-SCOPE: production`});
}
async function post(number, body, actor = fixture.A, metadata = {}) {return fixture.write(actor.client, issuePath(fixture.repo, number) + '/comments', {body, ...metadata});}
async function view(number) {return (await fixture.A.client.request(issuePath(fixture.repo, number))).data;}
async function count(number) {return (await fixture.pool.query(`SELECT count(*)::int AS n FROM "${fixture.schema}".comment WHERE repo_id=$1 AND issue_number=$2`, [fixture.repoId, number])).rows[0].n;}
async function reasons(number, body, actor = fixture.B, metadata = {}) {
  try {await actor.client.request(issuePath(fixture.repo, number) + '/preflight', {method: 'POST', body: {mode: 'comment', request: {body, ...metadata}}}); assert.fail('expected server 422');}
  catch (error) {assert.ok(error instanceof ClientError); assert.equal(error.status, 422); return error.reasons;}
}
async function invalidBoth(target, number, body, metadata = {}, field) {
  const expected = await reasons(number, body, target === ownerPage ? fixture.A : fixture.B, metadata), before = await count(number), composer = form(target);
  await composer.getByLabel('댓글 본문', {exact: true}).fill(body);
  if (metadata.compactDeferredReason) await composer.getByLabel('compactDeferredReason', {exact: true}).fill(metadata.compactDeferredReason);
  for (const name of ['검사','게시']) {
    const response = target.waitForResponse(response => new URL(response.url()).pathname === issuePath(fixture.repo, number) + (name === '검사' ? '/preflight' : '/comments') && response.status() === 422);
    await composer.getByRole('button', {name, exact: true}).click(); await response;
    await eventually(async () => JSON.stringify(await composer.getByRole('alert').getByRole('paragraph').allTextContents()) === JSON.stringify(expected), 'ordered422');
    assert.equal(await composer.getByLabel('댓글 본문', {exact: true}).getAttribute('aria-invalid'), 'true');
    assert.equal(await composer.getByLabel('댓글 본문', {exact: true}).inputValue(), body);
    if (field) {
      const control = composer.getByLabel(field, {exact: true});
      assert.equal(await control.getAttribute('aria-invalid'), 'true');
      const descriptions = await control.evaluate(element => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(id => {const description = document.getElementById(id); return description && !description.hidden ? description.textContent : null;}));
      assert.deepEqual(descriptions, [expected[0]], `${field}: exact server reason must describe the invalid input`);
      await composer.getByRole('link', {name: '첫 오류로 이동', exact: true}).click();
      assert.equal(await control.evaluate(element => element === document.activeElement), true);
    }
  }
  assert.equal(await count(number), before); return expected;
}
async function validPost(target, number, body, metadata = {}) {
  const composer = form(target); await composer.getByLabel('댓글 본문', {exact: true}).fill(body);
  if (metadata.compactDeferredReason) await composer.getByLabel('compactDeferredReason', {exact: true}).fill(metadata.compactDeferredReason);
  const before = await count(number), check = target.waitForResponse(response => new URL(response.url()).pathname === issuePath(fixture.repo, number) + '/preflight' && response.status() === 200);
  await composer.getByRole('button', {name: '검사', exact: true}).click(); const checked = await (await check).json(); assert.equal(checked.posted, false); assert.equal(await count(number), before);
  const response = target.waitForResponse(response => new URL(response.url()).pathname === issuePath(fixture.repo, number) + '/comments' && response.status() === 201);
  await composer.getByRole('button', {name: '게시', exact: true}).click(); const result = await (await response).json();
  await article(target, result.commentId).waitFor(); assert.equal(await count(number), before + 1);
  assert.equal(await composer.getByLabel('댓글 본문', {exact: true}).inputValue(), ''); return result.commentId;
}
async function compact(number, actor = fixture.A) {
  const path = issuePath(fixture.repo, number), packet = await fixture.write(actor.client, path + '/compact/prepare', {purpose: 'before-close'});
  const samples = packet.comments.filter(row => row.id !== packet.previousCompactId).slice(0,3).map(row => row.id);
  return post(number, `FROM:${actor.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${packet.throughId}${packet.previousCompactId ? ` RE:${packet.previousCompactId}` : ''}\n## ===== COMPACT #${number} through ${packet.throughId} =====\nU2 acceptance summary.\ncompacted-by:${fixture.B.alias}`, actor, {compactPacketToken: packet.packetToken, sampledIds: samples, compactedBy: fixture.B.alias});
}
before(async () => {
  const {chromium} = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT ? createRequire(resolve(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, 'package.json'))('playwright') : await import('playwright');
  fixture = await provisionBrowserFixture(); browser = await chromium.launch({headless: true});
  ownerContext = await browser.newContext({viewport: {width: 1440, height: 1000}}); readerContext = await browser.newContext({viewport: {width: 1440, height: 1000}});
  ownerPage = await ownerContext.newPage(); page = await readerContext.newPage(); await mkdir(output, {recursive: true});
  for (const target of [ownerPage, page]) {target.on('pageerror', error => pageErrors.push(error.message)); target.on('response', response => {const url = new URL(response.url()); if (url.pathname.startsWith('/v1/')) responses.push({path: url.pathname, status: response.status()});});}
  await login(ownerPage, fixture.A.token); await login(page, fixture.B.token);
});
afterEach(async t => {if (page) await page.screenshot({path: fileURLToPath(new URL(t.name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0,100) + '.png', output)), fullPage: true, mask: [page.getByLabel('세션 토큰', {exact: true})]});});
after(async () => {await ownerContext?.close(); await readerContext?.close(); await browser?.close(); await fixture?.cleanup(); await mkdir(output, {recursive: true}); await writeFile(new URL('observed.json', output), JSON.stringify({timestamp: new Date().toISOString(), server, browserLaunched: !!browser, observations, responses, pageErrors}, null, 2) + '\n'); assert.deepEqual(pageErrors, []);});

test('P9-04/05 U2 TYPE13 raw422 field reasons then preflight dry-run and one durable201', async () => {
  const created = await newIssue(), number = created.number; await open(page, number);
  assert.equal(await form(page).getByLabel('댓글 TYPE', {exact: true}).getByRole('option').count(), 13);
  const invalid = `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK\nACK-BY missing`;
  await invalidBoth(page, number, invalid); assert.equal(await form(page).getByLabel('ACK-BY', {exact: true}).getAttribute('aria-invalid'), 'true');
  for (const [field, body] of [
    ['TO', `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias},${fixture.B.alias} TYPE:NOTE\nTO syntax probe`],
    ['ACK-BY', `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:NOTE ACK-BY:tomorrow\nACK-BY syntax probe`],
    ['STATE', `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:REPORT STATE:invalid\nSTATE syntax probe`],
  ]) await invalidBoth(page, number, body, {}, field);
  const valid = `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK ACK-BY:${future()}\nASK @${fixture.A.alias}: U2 확인 요청.`;
  const id = await validPost(page, number, valid); await page.reload(); await article(page, id).waitFor(); assert.equal(await article(page, id).count(), 1);
  observations.push({id: 'P9-04/05', commentId: id, invalidRowsAdded: 0});
});

test('P9-06 U2 quick ACK preview/cancel changes no state, explicit post alone acknowledges', async () => {
  const {number} = await newIssue(), ask = await post(number, `FROM:${fixture.A.alias}/s1 TO:${fixture.B.alias} TYPE:ASK ACK-BY:${future()}\nASK @${fixture.B.alias}: ACK preview.`);
  await open(page, number); const source = article(page, ask.commentId); await source.getByRole('button', {name: '수신 확인 작성', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '수신 확인 미리보기', exact: true}); await dialog.waitFor(); assert.ok((await dialog.innerText()).includes(`RE:${ask.commentId}`));
  assert.equal((await view(number)).ackState.find(row => row.directiveId === ask.commentId).state, 'waiting');
  await dialog.getByRole('button', {name: '취소', exact: true}).click(); assert.equal((await view(number)).ackState.find(row => row.directiveId === ask.commentId).state, 'waiting');
  await source.getByRole('button', {name: '수신 확인 작성', exact: true}).click(); await dialog.getByLabel('ACK 본문', {exact: true}).fill(`FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ACK RE:${ask.commentId}\n부분수용. 근거 확인 후 보고.`);
  await dialog.getByRole('button', {name: 'ACK 게시', exact: true}).click(); await eventually(async () => (await view(number)).ackState.find(row => row.directiveId === ask.commentId).state === 'acked', 'direct ACK');
  observations.push({id: 'P9-06', directiveId: ask.commentId, previewAcknowledged: false});
});

test('P9-09 U2 older RE/SUPERSEDES opens one inert reference dialog and preserves snapshot/draft', async () => {
  const reply = await post(fixture.number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE RE:${fixture.before} SUPERSEDES:${fixture.before}\n참조 원문.`);
  await open(page); const composer = form(page), draft = '참조 중 보존 초안'; await composer.getByLabel('댓글 본문', {exact: true}).fill(draft);
  const source = article(page, reply.commentId); await source.getByRole('link', {name: `참조 댓글 ${fixture.before}`, exact: true}).click();
  const dialog = page.getByRole('dialog', {name: `참조 댓글 ${fixture.before}`, exact: true}); await dialog.waitFor(); await dialog.getByText('COMPACT 이전 댓글', {exact: false}).waitFor(); assert.ok((await dialog.innerText()).includes('COMPACT 이전 댓글'));
  assert.equal(await article(page, fixture.before).count(), 0); await page.keyboard.press('Escape');
  assert.equal(await composer.getByLabel('댓글 본문', {exact: true}).inputValue(), draft); assert.equal(await page.getByRole('button', {name: '전체 댓글 보기', exact: true}).getAttribute('aria-expanded'), 'false');
  await source.getByRole('link', {name: `대체 대상 ${fixture.before}`, exact: true}).click(); await dialog.waitFor(); await dialog.getByRole('button', {name: '참조 닫기', exact: true}).click();
  await page.getByRole('button', {name: '전체 댓글 보기', exact: true}).click(); await article(page, fixture.before).waitFor();
  await source.getByRole('link', {name: `참조 댓글 ${fixture.before}`, exact: true}).click(); assert.equal(await page.evaluate(() => document.activeElement?.id), `comment-${fixture.before}`);
  const ids = await page.getByTestId('comment').evaluateAll(rows => rows.map(row => row.getAttribute('data-comment-id'))); assert.equal(ids.length, new Set(ids).size);
  observations.push({id: 'P9-09', duplicateArticles: 0, draftPreserved: true});
});

test('P9-10 U2 priority OTHER folds, shared HOLD remains visible; directACK cannot release HOLD', async () => {
  const {number} = await newIssue(), seed = await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\nseed`);
  const other = await post(number, `FROM:${fixture.A.alias}/s1 TO:${fixture.A.alias} TYPE:NOTE\nOTHER full text`);
  const cc = await post(number, `FROM:${fixture.A.alias}/s1 TO:${fixture.A.alias} TYPE:NOTE CC:${fixture.B.alias}\nCC full text`);
  await open(page, number); await page.getByLabel('댓글 표시 순서', {exact: true}).selectOption('priority');
  assert.equal(await article(page, other.commentId).getByText('OTHER full text', {exact: true}).count(), 0);
  await article(page, other.commentId).getByText(`OTHER 댓글 ${other.commentId} 전문 보기`, {exact: true}).click(); await article(page, other.commentId).getByText('OTHER full text', {exact: true}).waitFor();
  assert.ok((await page.getByRole('region', {name: 'CC', exact: true}).innerText()).includes(cc.commentId));
  await article(page, seed.commentId).getByRole('button', {name: 'HOLD 작성', exact: true}).click();
  await eventually(async () => (await form(page).getByLabel('댓글 본문', {exact: true}).inputValue()).includes('TYPE:HOLD'), 'HOLD draft applied to composer');
  const holdDraft = await form(page).getByLabel('댓글 본문', {exact: true}).inputValue(); assert.ok(holdDraft.includes('TYPE:HOLD')); assert.equal(await count(number), 3);
  await invalidBoth(page, number, holdDraft.replace(/ SEEN:\S+/, ''));
  await invalidBoth(page, number, holdDraft.replace(/ACK-BY:\S+/, `ACK-BY:${future(20 * 60000)}`));
  const hold = await validPost(page, number, holdDraft); await article(page, hold).waitFor(); assert.ok((await article(page, hold).innerText()).includes('HOLD'));
  await post(number, `FROM:${fixture.A.alias}/s1 TO:${fixture.B.alias} TYPE:ACK RE:${hold}\n수용. 실제 중단.`, fixture.A);
  assert.ok((await view(number)).activeHolds.includes(hold));
  await article(page, hold).getByRole('button', {name: 'DECISION 작성', exact: true}).click();
  await eventually(async () => (await form(page).getByLabel('댓글 본문', {exact: true}).inputValue()).includes(`SUPERSEDES:${hold}`), 'checked DECISION draft applied to composer');
  const decision = await form(page).getByLabel('댓글 본문', {exact: true}).inputValue();
  await invalidBoth(page, number, decision.replace(/ ACK-BY:\S+/, ''), {compactDeferredReason: '긴급 해제 판정'});
  await invalidBoth(page, number, decision.replace(/SUPERSEDES:\S+/, 'SUPERSEDES:9999999999999999'), {compactDeferredReason: '긴급 해제 판정'});
  const released = await validPost(page, number, decision, {compactDeferredReason: '긴급 해제 판정'}); assert.ok(!(await view(number)).activeHolds.includes(hold));
  observations.push({id: 'P9-10', hold, released, ackAloneReleased: false});
});

test('P9-11 U2 NOENV inert raw is nonexecutable and offers only repost-request draft', async () => {
  await open(page); const legacy = article(page, fixture.legacy); assert.equal(await legacy.getByRole('alert').innerText(), '[NOENV] 봉투가 없어 실행할 수 없습니다');
  assert.equal(await legacy.getByRole('button', {name: '수신 확인 작성', exact: true}).count(), 0); assert.equal(await page.evaluate(() => window.legacyExecuted), undefined);
  const before = await count(fixture.number); await legacy.getByRole('button', {name: '봉투 재게시 요청 작성', exact: true}).click();
  await eventually(async () => (await form(page).getByLabel('댓글 본문', {exact: true}).inputValue()).includes(`ASK @${fixture.A.alias}:`), 'NOENV repost request draft applied to composer');
  assert.ok((await form(page).getByLabel('댓글 본문', {exact: true}).inputValue()).includes(`ASK @${fixture.A.alias}:`)); assert.equal(await count(fixture.number), before);
});

test('P9-12 U2 registry board NOTE template/1500 limit and forbidden ASK both422', async () => {
  const board = (await fixture.A.client.request(`/v1/repos/${fixture.repo}/board`)).data;
  await page.goto(`${server}/repos/${fixture.repo}/board`); await page.getByRole('region', {name: '게시판 발견 근거', exact: true}).waitFor();
  const template = page.getByRole('form', {name: '게시판 NOTE 템플릿', exact: true});
  await template.getByLabel('원 이슈(REPLY-IN)', {exact: true}).fill('#' + fixture.number); await template.getByLabel('원 이슈 최종 REPORT ID', {exact: true}).fill(fixture.finalReport);
  await template.getByLabel('결과 1줄', {exact: true}).fill('U2 deployed board'); await template.getByLabel('실패·교훈(최대 3줄)', {exact: true}).fill('서버 판정 원문 유지'); await template.getByLabel('재사용 산출물 경로', {exact: true}).fill('apps/issus/tests/browser/p9-u2.test.mjs');
  await template.getByRole('button', {name: 'NOTE 초안 만들기', exact: true}).click();
  await eventually(async () => (await form(page).getByLabel('댓글 본문', {exact: true}).inputValue()).includes('완료 공유: U2 deployed board'), 'board NOTE template applied to composer');
  const body = await form(page).getByLabel('댓글 본문', {exact: true}).inputValue(); assert.ok(Array.from(body).length <= 1500); const noteId = await validPost(page, board.number, body);
  const invalid = `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ASK ACK-BY:${future()}\nASK @${fixture.A.alias}: 게시판 금지.`; await invalidBoth(page, board.number, invalid);
  await invalidBoth(page, board.number, `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:NOTE\n${'x'.repeat(1500)}`);
  await invalidBoth(page, board.number, `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:HOLD ACK-BY:${future()} SEEN:${noteId}\n게시판 HOLD 금지`);
  await page.goto(`${server}/repos/${fixture.repo}/board?userBoard=${fixture.number}`); await page.getByRole('alert').filter({hasText: 'BOARD_CONFLICT'}).waitFor(); assert.equal(await form(page).count(), 0);
  observations.push({id: 'P9-12', board: board.number, invalidRowsAdded: 0});
});

test('P9-14 U2 create201 and competing edit412 preserve draft until explicit merge/recheck', async () => {
  await page.goto(`${server}/repos/${fixture.repo}/issues/new`); const create = page.getByRole('form', {name: '이슈 개설', exact: true}); await create.waitFor();
  const body = `STATE:running OWNER:${fixture.B.alias} UPDATED:${future(0)}\nGOAL: U2 create`;
  await create.getByLabel('제목', {exact: true}).fill('U2 create412'); await create.getByLabel('이슈 본문', {exact: true}).fill(body);
  const validation = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/validate' && response.status() === 200); await create.getByRole('button', {name: '문법 검사', exact: true}).click(); await validation;
  const made = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/repos/${fixture.repo}/issues` && response.status() === 201); await create.getByRole('button', {name: '이슈 개설', exact: true}).click(); const {number} = await (await made).json();
  const secondContext = await browser.newContext({viewport: {width: 1440, height: 1000}}), second = await secondContext.newPage(); second.on('pageerror', error => pageErrors.push(error.message));
  try {
    // Each editor gets its own cookie/CSRF pair; reconnecting in a shared context rotates the first pair.
    await login(second, fixture.B.token);
    await page.goto(ui(number) + '/edit'); await second.goto(ui(number) + '/edit'); const firstForm = page.getByRole('form', {name: '본문 편집', exact: true}), secondForm = second.getByRole('form', {name: '본문 편집', exact: true}); await firstForm.waitFor(); await secondForm.waitFor();
    const baseline = await firstForm.getByLabel('이슈 본문', {exact: true}).inputValue(); const first = baseline + '\nNEXT: first', mine = baseline + '\nNEXT: second';
    await firstForm.getByLabel('이슈 본문', {exact: true}).fill(first); await secondForm.getByLabel('이슈 본문', {exact: true}).fill(mine);
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === 200); await firstForm.getByRole('button', {name: '본문 저장', exact: true}).click(); await saved;
    const stale = second.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === 412); await secondForm.getByRole('button', {name: '본문 저장', exact: true}).click(); await stale;
    await second.getByRole('region', {name: '최신 서버 원문', exact: true}).waitFor(); assert.equal(await secondForm.getByLabel('이슈 본문', {exact: true}).inputValue(), mine); assert.equal((await view(number)).body, first);
    await secondForm.getByLabel('이슈 본문', {exact: true}).fill(first + '\nNEXT: merged second'); await secondForm.getByRole('button', {name: '최신 revision으로 병합 확인', exact: true}).click(); assert.equal(await secondForm.getByRole('button', {name: '본문 저장', exact: true}).isDisabled(), true);
    await secondForm.getByRole('button', {name: '문맥 검사', exact: true}).click(); await eventually(() => secondForm.getByRole('button', {name: '본문 저장', exact: true}).isEnabled(), 'rechecked merge');
    const merged = second.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === 200); await secondForm.getByRole('button', {name: '본문 저장', exact: true}).click(); await merged; assert.ok((await view(number)).body.endsWith('NEXT: merged second'));
    observations.push({id: 'P9-14', number, conflict: 412, draftPreserved: true});
  } finally {await secondContext.close();}
});

test('P9-15 U2 HANDOFF directTO ACK accept and OWNER latestrevision complete are separate phases', async () => {
  const source = await newIssue(), target = await newIssue(fixture.B); await open(ownerPage, source.number);
  await ownerPage.getByRole('button', {name: '이관', exact: true}).click(); const dialogA = ownerPage.getByRole('dialog', {name: '이관', exact: true}), write = dialogA.getByRole('form', {name: '이관 작성', exact: true});
  await write.getByLabel('TO', {exact: true}).fill(fixture.B.alias); await write.getByLabel('ACK-BY', {exact: true}).fill(future()); await write.getByLabel('REPLY-IN', {exact: true}).fill('#' + target.number); await write.getByRole('button', {name: '후속 이슈 확인', exact: true}).click();
  await write.getByLabel('결과·근거·남은 질문·자원·승인 경계', {exact: true}).fill('인계 결과·증거·미검증·CLAIM 없음.'); await write.getByLabel('compactDeferredReason', {exact: true}).fill('긴급 인계');
  await eventually(() => write.getByRole('button', {name: 'HANDOFF 게시', exact: true}).isEnabled(), 'target ready');
  const response = ownerPage.waitForResponse(response => new URL(response.url()).pathname === issuePath(fixture.repo, source.number) + '/comments' && response.status() === 201); await write.getByRole('button', {name: 'HANDOFF 게시', exact: true}).click(); const {commentId: id} = await (await response).json();
  const bad = await post(source.number, `FROM:${fixture.A.alias}/s1 TO:${fixture.B.alias} TYPE:ACK RE:${id}\n제삼자 ACK`, fixture.A);
  await open(page, source.number); await page.getByRole('button', {name: '이관', exact: true}).click(); const dialogB = page.getByRole('dialog', {name: '이관', exact: true}); await dialogB.getByLabel('HANDOFF 댓글 ID', {exact: true}).fill(id); await dialogB.getByRole('button', {name: '이관 단계 확인', exact: true}).click();
  const accept = dialogB.getByRole('form', {name: '이관 수용', exact: true}); await eventually(() => accept.getByRole('button', {name: '이관 수용 실행', exact: true}).isEnabled(), 'actual TO can accept');
  await accept.getByLabel('직접 ACK 댓글 ID', {exact: true}).fill(bad.commentId); const rejected = page.waitForResponse(response => response.url().endsWith('/accept') && response.status() === 422); await accept.getByRole('button', {name: '이관 수용 실행', exact: true}).click(); await rejected;
  const ack = await post(source.number, `FROM:${fixture.B.alias}/s1 TO:${fixture.A.alias} TYPE:ACK RE:${id}\n수용. 근거 확인.`, fixture.B); await accept.getByLabel('직접 ACK 댓글 ID', {exact: true}).fill(ack.commentId);
  const accepted = page.waitForResponse(response => response.url().endsWith('/accept') && response.status() === 200); await accept.getByRole('button', {name: '이관 수용 실행', exact: true}).click(); await accepted; assert.equal((await view(source.number)).envelope.STATE, 'running');
  await dialogA.getByLabel('HANDOFF 댓글 ID', {exact: true}).fill(id); await dialogA.getByRole('button', {name: '이관 단계 확인', exact: true}).click(); const complete = dialogA.getByRole('form', {name: '이관 완료', exact: true}); await eventually(() => complete.getByRole('button', {name: '이관 완료 실행', exact: true}).isEnabled(), 'OWNER complete enabled');
  assert.equal(Number(await complete.getByLabel('expectedRevision', {exact: true}).inputValue()), (await view(source.number)).revision);
  const completed = ownerPage.waitForResponse(response => response.url().endsWith('/complete') && response.status() === 200); await complete.getByRole('button', {name: '이관 완료 실행', exact: true}).click(); await completed;
  const final = await view(source.number); assert.equal(final.envelope.STATE, 'cancelled'); assert.equal(final.envelope['REPLY-IN'], '#' + target.number); assert.equal(final.envelope.OWNER, fixture.A.alias);
  await dialogA.getByRole('button', {name: '이관 닫기', exact: true}).click(); await dialogB.getByRole('button', {name: '이관 닫기', exact: true}).click(); observations.push({id: 'P9-15', handoffId: id, rejectedThirdParty: true, finalRevision: final.revision});
});

test('P9-16 U2 CLAIM due expiry does not release; own RELEASE only; close blockers then final compact close200', {timeout: 90000}, async t => {
  const {number} = await newIssue(), seed = await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\nclaim seed`); await open(page, number);
  const claimBody = `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:CLAIM DUE:${future()} SEEN:${seed.commentId}\n자원: U2전용·원복 담당 본인.`;
  await invalidBoth(page, number, claimBody.replace(/ DUE:\S+/, '')); await invalidBoth(page, number, claimBody.replace(/ SEEN:\S+/, ''));
  const due = new Date(Date.now() + 8000), claim = await validPost(page, number, claimBody.replace(/DUE:\S+/, `DUE:${iso(due)}`)); await new Promise(resolve => setTimeout(resolve, Math.max(0, due.getTime() - Date.now()) + 100)); assert.ok((await view(number)).claims.includes(claim));
  const foreign = await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:CLAIM DUE:${future()} SEEN:${claim}\n다른 소유 CLAIM`);
  await invalidBoth(page, number, `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:RELEASE\nRE 누락`);
  await invalidBoth(page, number, `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:RELEASE RE:${foreign.commentId}\n타인 CLAIM`);
  await validPost(page, number, `FROM:${fixture.B.alias}/s1 TO:ALL TYPE:RELEASE RE:${claim}\n원복 완료, 다음 담당 착수 가능.`); assert.ok(!(await view(number)).claims.includes(claim)); assert.ok((await view(number)).claims.includes(foreign.commentId));
  const report = await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:REPORT STATE:done\nU2 완료 근거.`); await open(ownerPage, number); await ownerPage.getByRole('button', {name: '이슈 닫기', exact: true}).click(); const dialog = ownerPage.getByRole('dialog', {name: '이슈 닫기 확인', exact: true});
  await dialog.getByLabel('최종 REPORT id', {exact: true}).fill(report.commentId); await dialog.getByLabel('닫기 사유', {exact: true}).fill('U2 acceptance'); const blocked = ownerPage.waitForResponse(response => response.url().endsWith('/close') && response.status() === 409); await dialog.getByRole('button', {name: '닫기 실행', exact: true}).click(); await blocked;
  await dialog.getByRole('region', {name: '서버 닫기 차단 항목', exact: true}).getByRole('link', {name: `참조 댓글 ${foreign.commentId}`, exact: true}).waitFor();
  const compactStatus = (await fixture.A.client.request(issuePath(fixture.repo, number) + '/compact/status')).data;
  const persistedDue = (await fixture.pool.query(`SELECT due_reasons FROM "${fixture.schema}".compact_segment WHERE repo_id=$1 AND issue_number=$2`, [fixture.repoId, number])).rows[0]?.due_reasons ?? [];
  const dueFacts = (await fixture.pool.query(`SELECT payload->'reasons' AS reasons FROM event_store WHERE action='issus.compact.due' AND payload->'issue'->>'repoId'=$1 AND payload->'issue'->>'issueNumber'=$2`, [fixture.repoId, String(number)])).rows;
  const closeEvidence = {number, compactStatus, persistedDue, dueFacts, closed200: false};
  await writeFile(new URL('claim-close-case.json', output), JSON.stringify(closeEvidence, null, 2) + '\n');
  assert.ok(persistedDue.includes('before-close'), 'blocked close must preserve the before-close projection');
  assert.ok(dueFacts.some(fact => fact.reasons.includes('before-close')), 'blocked close must preserve the before-close fact');
  t.diagnostic('P9-16 durable before-close observation confirmed; HTTP status reasons=' + compactStatus.reasons.join(','));
  await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:RELEASE RE:${foreign.commentId}\n원복 완료.`); const current = await view(number); await fixture.write(fixture.A.client, issuePath(fixture.repo, number) + '/body', {body: current.body.replace('STATE:running','STATE:done')}, {method: 'PATCH', revision: current.revision});
  const finalReport = await post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:REPORT STATE:done\n최종 근거·모든 점유 반납.`), summary = await compact(number);
  await eventually(async () => (await ownerPage.getByRole('region', {name: '이슈 현재 상태', exact: true}).innerText()).includes(summary.commentId), 'new body revision loaded');
  await dialog.getByLabel('최종 REPORT id', {exact: true}).fill(finalReport.commentId); const closed = ownerPage.waitForResponse(response => response.url().endsWith('/close') && response.status() === 200); await dialog.getByRole('button', {name: '닫기 실행', exact: true}).click(); await closed;
  await eventually(async () => !(await view(number)).issue.isOpen, 'closed200'); await ownerPage.getByRole('status').filter({hasText: /^이슈가 닫혔습니다$/}).waitFor();
  assert.equal(await form(ownerPage).count(), 0); await assert.rejects(() => post(number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE\nclosed comment`), error => error instanceof ClientError && error.status === 409);
  closeEvidence.closed200 = true; await writeFile(new URL('claim-close-case.json', output), JSON.stringify(closeEvidence, null, 2) + '\n');
  // Keep the HTTP assertion, after exercising the remaining close path and saving its evidence.
  assert.ok(compactStatus.reasons.includes('before-close'), 'known failure: GET compact/status omits durable before-close reason');
  observations.push({id: 'P9-16', number, claim, dueExpiryReleased: false, closeStatus: 200});
});

test('P9-23 U2 keyboard reference dialog Escape restores focus and preserves draft at narrow width', async () => {
  await open(page); await page.setViewportSize({width: 860, height: 950}); const draft = 'Esc와 focus 보존'; await form(page).getByLabel('댓글 본문', {exact: true}).fill(draft);
  const source = await post(fixture.number, `FROM:${fixture.A.alias}/s1 TO:ALL TYPE:NOTE RE:${fixture.before}\nkeyboard reference`); await article(page, source.commentId).waitFor(); const link = article(page, source.commentId).getByRole('link', {name: `참조 댓글 ${fixture.before}`, exact: true}); await link.focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog', {name: `참조 댓글 ${fixture.before}`, exact: true}).waitFor(); await page.keyboard.press('Escape'); assert.equal(await link.evaluate(element => element === document.activeElement), true); assert.equal(await form(page).getByLabel('댓글 본문', {exact: true}).inputValue(), draft);
  const ackTrigger = article(page, fixture.ask).getByRole('button', {name: '수신 확인 작성', exact: true}); await ackTrigger.focus(); await page.keyboard.press('Enter'); const ackDialog = page.getByRole('dialog', {name: '수신 확인 미리보기', exact: true}); await ackDialog.getByLabel('ACK 본문', {exact: true}).fill('Esc 전 ACK 초안'); await page.keyboard.press('Tab'); assert.equal(await ackDialog.evaluate(element => element.contains(document.activeElement)), true); await page.keyboard.press('Escape'); assert.equal(await ackTrigger.evaluate(element => element === document.activeElement), true); await page.keyboard.press('Enter'); assert.equal(await ackDialog.getByLabel('ACK 본문', {exact: true}).inputValue(), 'Esc 전 ACK 초안'); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('main').count(), 1); await page.setViewportSize({width: 1440, height: 1000});
});
