import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {createDatabasePool, EventStore} from 'agent/broker';
import {IssusClient, issuePath} from 'issus_domain/front';
import {parseFactPayload} from 'issus_domain/common';

export async function eventually(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {const result = await check(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 50));}
  throw new Error('timeout: ' + label);
}

/** Only a separately deployed, disposable test schema may receive the legacy read fixture. */
export async function provisionBrowserFixture() {
  const server = process.env.ISSUS_TEST_SERVER_URL, schema = process.env.ISSUS_TEST_SCHEMA, brokerSchema = process.env.ISSUS_TEST_BROKER_SCHEMA;
  assert.ok(server, 'ISSUS_TEST_SERVER_URL must name the deployed server; no fallback');
  assert.match(schema ?? '', /^issus_test_p8_[a-z0-9_]+$/);
  assert.match(brokerSchema ?? '', /^issus_test_p8_b_[a-z0-9_]+$/);
  assert.ok(process.env.ISSUS_TEST_DATABASE_URL, 'isolated PostgreSQL fixture requires ISSUS_TEST_DATABASE_URL');
  assert.ok(process.env.ISSUS_TEST_BOOTSTRAP_TOKEN, 'ephemeral bootstrap must be supplied in environment');
  const owner = process.env.ISSUS_TEST_OWNER ?? 'tester';
  const operator = new IssusClient({server, token: process.env.ISSUS_TEST_BOOTSTRAP_TOKEN});
  const suffix = randomBytes(3).toString('hex'), code = 'w' + suffix.slice(0,5), repo = `${owner}/p8-${suffix}`;
  const url = new URL(process.env.ISSUS_TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${brokerSchema},public`);
  const pool = createDatabasePool(url.toString(), 2), store = new EventStore(pool), sessions = [];
  const write = (client, path, body, extra = {}) => client.write(path, {method: 'POST', key: randomUUID(), body, ...extra});
  async function cleanup() {for (const session of sessions) await write(operator, '/v1/sessions/' + session.sessionId, undefined, {method: 'DELETE'}).catch(() => {}); await pool.end();}
  try {
    assert.equal((await fetch(new URL('/ready', server))).status, 200);
    const created = await write(operator, '/v1/repos', {owner, slug: repo.split('/')[1], projectCode: code, autoBoard: true});
    const repoId = created.repoId;
    assert.equal((await pool.query(`SELECT id FROM "${schema}".repo WHERE id=$1`, [repoId])).rows[0]?.id, repoId, 'server must use the supplied disposable schema');
    async function session(role) {
      const alias = `${code}-1-${role}`;
      const registration = await write(operator, `/v1/owners/${owner}/aliases`, {name: alias, role: 'browser', model: 'fake', scope: 'P8', repos: [repoId], announcementBody: `FROM:${alias}/by-${code}-system TO:ALL TYPE:ALIAS\n${alias} | browser | fake | P8 | s1`});
      const opened = await write(operator, '/v1/sessions', {alias, sid: 's1'}); sessions.push(opened);
      return {...opened, alias, aliasId: registration.aliasId, client: new IssusClient({server, token: opened.token})};
    }
    const A = await session('author'), B = await session('reader');
    const iso = date => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const issue = await write(A.client, `/v1/repos/${repo}/issues`, {title: 'P8 브라우저 계약', body: `STATE:running OWNER:${A.alias} UPDATED:${iso(new Date())}\nGOAL: deployed browser`});
    const path = issuePath(repo, issue.number);
    const post = (body, client = A.client, metadata = {}) => write(client, path + '/comments', {body, ...metadata});
    const before = await post(`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\nCOMPACT 이전 댓글`);
    const packet = await write(A.client, path + '/compact/prepare', {purpose: 'before-close'});
    const compact = await post(`FROM:${A.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${packet.throughId}\n## ===== COMPACT #${issue.number} through ${packet.throughId} =====\n배포 브라우저 구간 요약.\ncompacted-by:${B.alias}`, A.client, {compactPacketToken: packet.packetToken, sampledIds: [before.commentId], compactedBy: B.alias});
    // Test-only imported read model; no production import route or invalid native POST is added.
    const c = await pool.connect(); let legacyId;
    try {
      await c.query('BEGIN');
      const row = (await c.query(`UPDATE "${schema}".comment_counter SET last_id=last_id+1 WHERE id=1 RETURNING last_id::text AS id`)).rows[0]; legacyId = row.id;
      const source = (await c.query(`SELECT * FROM "${schema}".comment WHERE id=$1`, [before.commentId])).rows[0];
      const body = `작성: ${A.alias}\n이전 형식의 보존 댓글 <script>window.legacyExecuted=true</script>`;
      await c.query(`INSERT INTO "${schema}".comment(id,owner_id,repo_id,issue_number,body,envelope,author_alias_id,author_session_id,posted_by_alias_id,char_count,validity) VALUES($1,$2,$3,$4,$5,'{}',$6,$7,$6,$8,'noenv')`, [legacyId, source.owner_id, repoId, issue.number, body, A.aliasId, A.sessionId, Array.from(body).length]);
      const revision = (await c.query(`UPDATE "${schema}".issue SET revision=revision+1 WHERE repo_id=$1 AND number=$2 RETURNING revision`, [repoId, issue.number])).rows[0].revision;
      const payload = {ownerId: source.owner_id, repoId, issueNumber: issue.number, revision, commentId: legacyId, body, envelope: {}, metadata: {}, charCount: Array.from(body).length, author: {ownerId: source.owner_id, aliasId: A.aliasId, alias: A.alias, sid: 's1', sessionId: A.sessionId}, validity: 'noenv'};
      assert.equal(parseFactPayload('issus.comment.posted', payload).ok, true);
      const id = randomUUID(), channel = `issue:${repoId}:${issue.number}`;
      await store.appendManyOn(c, [{eventId: id, eventVersion: 1, kind: 'fact', streamId: `channel:${channel}`, action: 'issus.comment.posted', transactionKey: id, correlationId: id, channel, source: 'server', audience: 'client', createdAt: new Date().toISOString(), payload}]);
      await c.query('COMMIT');
    } catch (error) {await c.query('ROLLBACK'); throw error;} finally {c.release();}
    const after = await post(`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\nCOMPACT 이후 댓글`);
    const finalReport = await post(`FROM:${A.alias}/s1 TO:ALL TYPE:REPORT STATE:done\n닫기 차단 시나리오의 최종 REPORT.\nNEXT: 독립 수용 확인.`);
    const ask = await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${iso(new Date(Date.now()+600000))}\nASK @${B.alias}: 배포 UI에서 ACK를 작성하세요.\nNEXT: 확인.`);
    const delivery = await eventually(async () => {
      const page = (await B.client.request(`/v1/inbox?repo=${repo}&issues=${issue.number}`)).data;
      return page.items.find(item => item.commentId === ask.commentId)?.delivery;
    }, 'browser ASK route');
    return {server, schema, brokerSchema, repo, repoId, number: issue.number, path, A, B, before: before.commentId, compact: compact.commentId, after: after.commentId, legacy: legacyId, ask: ask.commentId, delivery, finalReport: finalReport.commentId, pool, post, write, cleanup};
  } catch (error) {await cleanup(); throw error;}
}
