import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {EventStore,PgmqClient} from 'agent/broker';
import {charCount,type CompactPacket} from '../../../common/index.js';
import {EventUnitOfWork,identifier,sha256,type CorePrincipal} from '../../backend/index.js';
import {IntakeService} from '../../intake/index.js';
import {CompactService,compactPublication} from '../index.js';

/** P6-only real DB fixture. No production schema, credentials, containers or shared queues are changed. */
export async function compactHarness() {
  const url=process.env.ISSUS_TEST_DATABASE_URL;if(!url) throw new Error('ISSUS_TEST_DATABASE_URL is required (P6 real DB tests never skip)');
  const suffix=randomBytes(6).toString('hex'),schema=`issus_p6_${suffix}`,brokerSchema=`issus_p6_b_${suffix}`,queueName=`p6_${suffix}_route`;
  const admin=new Pool({connectionString:url,max:3}),pool=new Pool({connectionString:url,max:8,options:`-c search_path=${brokerSchema},public`});
  pool.on('error',()=>{});admin.on('error',()=>{});
  const q=(name:string)=>`${identifier(schema)}.${identifier(name)}`;
  let failAppend=false,failSend=false,now=new Date('2026-10-21T04:00:00Z');
  const store=new EventStore(pool,undefined,{retentionDays:null}),queue=new PgmqClient(pool);
  const uow=new EventUnitOfWork({pool,schema,clock:{now:()=>new Date(now)},eventStore:{appendManyOn:async(...args)=>{if(failAppend) throw new Error('P6 injected append failure');return store.appendManyOn(...args);}},queue:{sendOn:async(...args)=>{if(failSend) throw new Error('P6 injected queue failure');return queue.sendOn(...args);}},reactions:{'issus.comment.posted':[queueName],'issus.compact.due':[queueName]}});
  const intake=new IntakeService({uow,publication:compactPublication}),service=new CompactService(uow);
  const ownerId=randomUUID(),repoId=randomUUID(),alphaId=randomUUID(),bravoId=randomUUID(),sessionId=randomUUID(),bravoSessionId=randomUUID();
  const alpha:CorePrincipal={kind:'session',id:sessionId,ownerId,aliasId:alphaId,alias:'tt-1-alpha',sid:'s1',sessionId,capabilities:[]};
  const bravo:CorePrincipal={kind:'session',id:bravoSessionId,ownerId,aliasId:bravoId,alias:'tt-1-bravo',sid:'s1',sessionId:bravoSessionId,capabilities:[]};
  async function cleanup() {
    await admin.query('SELECT pgmq.drop_queue($1)',[queueName]);await admin.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS ${identifier(brokerSchema)} CASCADE`);await pool.end();await admin.end();
  }
  try {
    await admin.query(`CREATE SCHEMA ${identifier(brokerSchema)}`);
    const baseline=await readFile(new URL('../../backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8');
    await admin.query(baseline.replace(/\bissus\b/g,identifier(schema)));
    await admin.query(`CREATE TABLE ${q('history_snapshot')}(id uuid PRIMARY KEY,principal_id uuid NOT NULL,scope_hash text NOT NULL,snapshot jsonb NOT NULL,expires_at timestamptz NOT NULL)`);
    await store.ensureSchema();await admin.query('SELECT pgmq.create($1)',[queueName]);
    await pool.query(`INSERT INTO ${q('owner')}(id,name) VALUES($1,'tester')`,[ownerId]);
    for(const [id,name,sid] of [[alphaId,alpha.alias,sessionId],[bravoId,bravo.alias,bravoSessionId]]) {
      await pool.query(`INSERT INTO ${q('alias')}(id,owner_id,name,folded_name) VALUES($1,$2,$3,$3)`,[id,ownerId,name]);
      await pool.query(`INSERT INTO ${q('session')}(id,owner_id,alias_id,sid,token_hash,expires_at) VALUES($1,$2,$3,'s1',$4,'2027-01-01T00:00:00Z')`,[sid,ownerId,id,sha256(randomUUID())]);
    }
    await pool.query(`INSERT INTO ${q('repo')}(id,owner_id,slug,project_code,auto_board) VALUES($1,$2,'compact','tt',false)`,[repoId,ownerId]);
    for(const id of [alphaId,bravoId]) await pool.query(`INSERT INTO ${q('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[ownerId,id,repoId]);
    async function newIssue(board=false) {
      const r=await intake.execute({principal:alpha,action:'issus.issue.open',payload:{repoId,title:'P6 real DB',body:'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T04:00:00+00:00\nGOAL: compact'},idempotencyKey:randomUUID()});
      if(r.httpStatus!==201) throw new Error(JSON.stringify(r));const number=Number(r.response.number);
      if(board) await pool.query(`UPDATE ${q('issue')} SET is_board=true WHERE repo_id=$1 AND number=$2`,[repoId,number]);
      return number;
    }
    const note=(content:string)=>`FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n${content}`;
    async function post(number:number,request:Record<string,unknown>,p=alpha,key=randomUUID()) {return intake.execute({principal:p,action:'issus.comment.post',payload:{repoId,issueNumber:number,...request},idempotencyKey:key});}
    let ordinal=0;
    async function add(number:number,count:number,size?:number) {
      const ids:string[]=[];
      for(let i=0;i<count;i++) {let body=note(`note ${number}/${ordinal++}`);if(size!==undefined) body+='x'.repeat(size-charCount(body));const r=await post(number,{body});if(r.httpStatus!==201) throw new Error(JSON.stringify(r));ids.push(String(r.response.commentId));}return ids;
    }
    const compactRequest=(number:number,packet:CompactPacket,changes:Record<string,unknown>={})=>({body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT${packet.previousCompactId?` RE:${packet.previousCompactId}`:''} SEEN:${packet.throughId}\n## ===== COMPACT #${number} through ${packet.throughId} =====\n구간 ${packet.count}댓글·${packet.chars}자. 미확인 없음.\ncompacted-by:tt-1-bravo`,compactPacketToken:packet.packetToken,sampledIds:packet.comments.slice(0,3).map(c=>c.id),compactedBy:'tt-1-bravo',...changes});
    async function reaction(commentId:string) {
      const row=(await pool.query(`SELECT event_id,stream_id,sequence,action,payload FROM event_store WHERE action='issus.comment.posted' AND payload->>'commentId'=$1`,[commentId])).rows[0];
      return {sourceEventId:row.event_id,sourceStreamId:row.stream_id,sourceSequence:String(row.sequence),action:row.action,payload:row.payload};
    }
    async function fingerprint() {
      const tables=(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map(r=>r.tablename as string),rows:unknown[]=[];
      for(const name of tables) rows.push([name,(await pool.query(`SELECT to_jsonb(t) AS row FROM ${q(name)} t ORDER BY to_jsonb(t)::text`)).rows]);
      for(const name of ['event_store','event_stream_sequence']) rows.push([name,(await pool.query(`SELECT to_jsonb(t) AS row FROM ${identifier(brokerSchema)}.${identifier(name)} t ORDER BY to_jsonb(t)::text`)).rows]);
      rows.push((await pool.query(`SELECT to_jsonb(t) AS row FROM pgmq.${identifier('q_'+queueName)} t ORDER BY msg_id`)).rows);return sha256(JSON.stringify(rows));
    }
    return {pool,store,uow,intake,service,alpha,bravo,ownerId,repoId,schema,brokerSchema,queueName,q,newIssue,note,post,add,compactRequest,reaction,fingerprint,cleanup,setClock:(v:Date)=>{now=v;},failAppend:(v:boolean)=>{failAppend=v;},failSend:(v:boolean)=>{failSend=v;}};
  }catch(error){try{await cleanup();}catch{}throw error;}
}
