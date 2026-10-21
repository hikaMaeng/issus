// Independent integration harness, using the workspace-installed pg driver (no production dependency).
import pg from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const url=process.env.ISSUS_TEST_DATABASE_URL;
if(!url)throw new Error('ISSUS_TEST_DATABASE_URL required');
const schema='p3_domain_'+randomUUID().replaceAll('-','');
const sql=readFileSync(new URL('../../../../src/server/backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8').replace(/\bissus\b/g,schema);
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
const rows=[];
function note(name){rows.push(name); console.log('PASS '+name);}
const ids=Array.from({length:20},()=>randomUUID());
await db.connect();
await db.query('BEGIN');
try {
 await db.query(sql); note('baseline SQL applies in isolated schema');
 const tables=await db.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema]);
 assert.deepEqual(tables.rows.map(r=>r.tablename),['alias','alias_repo','claim','command_result','comment','comment_counter','comment_reference','compact_packet','compact_segment','delivery','delivery_receipt','directive','directive_recipient','handoff','inbox_clock','issue','owner','processed','projection_applied','repo','schedule','session','subscription']);
 note('tables='+tables.rowCount+' '+tables.rows.map(r=>r.tablename).join(','));
 const q=async(s,p=[])=>db.query(s.replace(/\bissus\b/g,schema),p);
 let serial=0;
 async function rejects(name,sql,params,code){const save='case_'+serial++; await q('SAVEPOINT '+save); try{await q(sql,params);await q('SET CONSTRAINTS ALL IMMEDIATE');assert.fail(name+' unexpectedly accepted');}catch(e){assert.equal(e.code,code,name+': '+e.message);note(name+' SQLSTATE='+code);}finally{await q('ROLLBACK TO SAVEPOINT '+save);}}
 await q('INSERT INTO issus.owner(id,name) VALUES($1,\'p3-owner-a\'),($2,\'p3-owner-b\')',[ids[0],ids[1]]);
 await rejects('owner case folded unique','INSERT INTO issus.owner(id,name) VALUES($1,\'P3-OWNER-A\')',[ids[19]],'23505');
 await q('INSERT INTO issus.owner(id,name) VALUES($1,$2)',[randomUUID(),'Straße']);
 await rejects('owner Unicode casefold sharp-s','INSERT INTO issus.owner(id,name) VALUES($1,$2)',[randomUUID(),'STRASSE'],'23505');
 await q("INSERT INTO issus.alias(id,owner_id,name,folded_name) VALUES($1,$2,'p3-aa','p3-aa'),($3,$4,'p3-bb','p3-bb')",[ids[2],ids[0],ids[3],ids[1]]);
 await q("INSERT INTO issus.repo(id,owner_id,slug,project_code) VALUES($1,$2,'sample','p3'),($3,$4,'sample','p3')",[ids[4],ids[0],ids[5],ids[1]]);
 await q('INSERT INTO issus.alias_repo(owner_id,alias_id,repo_id) VALUES($1,$2,$3)',[ids[0],ids[2],ids[4]]);
 await rejects('membership cross owner FK','INSERT INTO issus.alias_repo(owner_id,alias_id,repo_id) VALUES($1,$2,$3)',[ids[0],ids[3],ids[4]],'23503');
 await q("INSERT INTO issus.issue(owner_id,repo_id,number,title,body,state,owner_alias_id,is_board) VALUES($1,$2,1,'sample','body','running',$3,true)",[ids[0],ids[4],ids[2]]);
 await rejects('one board per repo',"INSERT INTO issus.issue(owner_id,repo_id,number,title,body,state,owner_alias_id,is_board) VALUES($1,$2,2,'sample','body','running',$3,true)",[ids[0],ids[4],ids[2]],'23505');
 await rejects('closed nonterminal state',"UPDATE issus.issue SET is_open=false WHERE repo_id=$1",[ids[4]],'23514');
 await rejects('issue owner cross scope',"UPDATE issus.issue SET owner_alias_id=$1 WHERE repo_id=$2",[ids[3],ids[4]],'23503');
 await q("INSERT INTO issus.session(id,owner_id,alias_id,sid,token_hash,expires_at) VALUES($1,$2,$3,'s1',$4,now()+interval '1 hour')",[ids[6],ids[0],ids[2],'a'.repeat(64)]);
 await rejects('one active writer',"INSERT INTO issus.session(id,owner_id,alias_id,sid,token_hash,expires_at) VALUES($1,$2,$3,'s2',$4,now()+interval '1 hour')",[ids[7],ids[0],ids[2],'b'.repeat(64)],'23505');
 const body='FROM:p3-aa/s1 TO:ALL TYPE:NOTE\n검증 😀';
 await q("INSERT INTO issus.comment(id,owner_id,repo_id,issue_number,body,envelope,author_alias_id,author_session_id,posted_by_alias_id,char_count) VALUES(1000000,$1,$2,1,$3,'{}',$4,$5,$4,$6)",[ids[0],ids[4],body,ids[2],ids[6],Array.from(body).length]);
 await rejects('comment immutable update',"UPDATE issus.comment SET body='changed' WHERE id=1000000",[],'55000');
 await rejects('comment immutable delete','DELETE FROM issus.comment WHERE id=1000000',[],'55000');
 await rejects('comment codepoint length',"INSERT INTO issus.comment(id,owner_id,repo_id,issue_number,body,envelope,author_alias_id,author_session_id,posted_by_alias_id,char_count) VALUES(1000001,$1,$2,1,$3,'{}',$4,$5,$4,1)",[ids[0],ids[4],body,ids[2],ids[6]],'23514');
 await rejects('raw packet token rejected',"INSERT INTO issus.comment(id,owner_id,repo_id,issue_number,body,envelope,metadata,author_alias_id,author_session_id,posted_by_alias_id,char_count) VALUES(1000001,$1,$2,1,'x','{}','{\"compactPacketToken\":\"redacted-test\"}',$3,$4,$3,1)",[ids[0],ids[4],ids[2],ids[6]],'23514');
 await q('UPDATE issus.comment_counter SET last_id=last_id+1 WHERE id=1 RETURNING last_id');
 await q('SAVEPOINT counter_rollback');await q('UPDATE issus.comment_counter SET last_id=last_id+1 WHERE id=1');await q('ROLLBACK TO SAVEPOINT counter_rollback');
 assert.equal((await q('SELECT last_id FROM issus.comment_counter')).rows[0].last_id,'1000000');note('comment counter rollback consumes no id');
 await q("INSERT INTO issus.delivery(id,owner_id,source_event_id,source_stream_id,source_sequence,comment_id,recipient_alias_id,classification,ordinal,ack_required,content) VALUES($1,$2,$3,'channel:test',1,1000000,$4,'ALL',1,false,'{}')",[ids[8],ids[0],ids[9],ids[2]]);
 await rejects('delivery natural key unique',"INSERT INTO issus.delivery(id,owner_id,source_event_id,source_stream_id,source_sequence,recipient_alias_id,classification,ordinal,ack_required,content) VALUES($1,$2,$3,'channel:test',1,$4,'ALL',2,false,'{}')",[ids[10],ids[0],ids[9],ids[2]],'23505');
 await rejects('delivery alias ordinal unique',"INSERT INTO issus.delivery(id,owner_id,source_event_id,source_stream_id,source_sequence,recipient_alias_id,classification,ordinal,ack_required,content) VALUES($1,$2,$3,'channel:test',1,$4,'ALL',1,false,'{}')",[ids[10],ids[0],ids[11],ids[2]],'23505');
 await rejects('informational delivery cannot ack',"UPDATE issus.delivery SET state='acked' WHERE id=$1",[ids[8]],'23514');
 await rejects('ignored requires reason',"INSERT INTO issus.processed(owner_id,alias_id,delivery_id,disposition,recorded_by_session) VALUES($1,$2,$3,'ignored',$4)",[ids[0],ids[2],ids[8],ids[6]],'23514');
 await q("INSERT INTO issus.processed(owner_id,alias_id,delivery_id,disposition,recorded_by_session,reason) VALUES($1,$2,$3,'ignored',$4,'not relevant')",[ids[0],ids[2],ids[8],ids[6]]);
 note('processed valid ignore accepted');
 await q('SET CONSTRAINTS ALL IMMEDIATE');note('deferred scope constraints valid');
} finally {await db.query('ROLLBACK'); const remaining=await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema]);assert.equal(remaining.rowCount,0);note('test schema removed by rollback');await db.end();}
console.log('schema checks='+rows.length);
writeFileSync(new URL('../../../../../../.cache/p3/logs/schema-results.json',import.meta.url),JSON.stringify(rows,null,2)+'\n','utf8');
