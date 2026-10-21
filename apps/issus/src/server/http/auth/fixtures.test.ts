import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {refs,sha256} from 'issus_domain/server';
import {parseEnvelope as envelope,parseIssueBodyEnvelope as bodyEnvelope} from 'issus_domain/common';
import {startCoreHarness} from './testing.js';

const root=new URL('../../../../../../packages/issus_domain/tests/fixtures/issue-board-v2/good/',import.meta.url);
/** Raw canonical fixtures stay immutable. Legacy aliases/references and historical Clock are explicit prerequisites. */
test('fixture HTTP live writes: comment28 + body4',{skip:!process.env.ISSUS_TEST_DATABASE_URL},async t=>{
  const files=(await readdir(root)).filter(f=>f.endsWith('.md')).sort();let posted=0,edited=0;
  for(const filename of files) await t.test(filename,async()=>{
    const original=await readFile(new URL(filename,root),'utf8'),isBody=original.startsWith('STATE:');
    const e=isBody?bodyEnvelope(original).envelope! as unknown as Record<string,string>:envelope(original.split('\n')[0]);
    const h=await startCoreHarness();
    const q=(table:string)=>`"${h.schema}"."${table}"`;
    try {
      const deadlines=[e['ACK-BY'],e.DUE].filter(Boolean).map(s=>new Date(s).getTime());if(deadlines.length) h.setClock(new Date(Math.min(...deadlines)-60000));
      const created=await h.http('/v1/repos',{owner:'tester',slug:'fixtures',projectCode:'p4',autoBoard:false});assert.equal(created.status,201,JSON.stringify(created.body));const repoId=created.body.repoId;
      const from=isBody?e.OWNER:e.FROM.split('/')[0],sid=isBody?'s1':e.FROM.split('/')[1];
      const names=[...new Set([from,...(isBody?[]:[e.TO,...(e.CC??'').split(',')]),...(isBody&&e.BOARD?['p4-board']:[]),...(e.TYPE==='COMPACT'?['p4-24-compact']:[])].filter(n=>n&&n.toUpperCase()!=='ALL'))];
      const aliases=new Map<string,{id:string;sessionId:string;token:string}>();
      // Legacy fixture registry is an imported prerequisite, not a claim that modern near-alias checks accept these names together.
      for(const name of names) {
        const id=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url');
        await h.pool.query(`INSERT INTO ${q('alias')}(id,owner_id,name,folded_name) VALUES($1,$2,$3,lower($3))`,[id,h.bootstrap.ownerId,name]);
        await h.pool.query(`INSERT INTO ${q('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[h.bootstrap.ownerId,id,repoId]);
        await h.pool.query(`INSERT INTO ${q('session')}(id,owner_id,alias_id,sid,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,'2030-01-01T00:00Z')`,[sessionId,h.bootstrap.ownerId,id,name===from?sid:'s1',sha256(token)]);aliases.set(name,{id,sessionId,token});
      }
      const author=aliases.get(from)!,number=filename==='board-body.md'||filename.startsWith('board-note')||filename.startsWith('board-lesson')?3:24;
      const baseline=`STATE:running OWNER:${from} UPDATED:2026-10-20T00:00:00+00:00\nGOAL: fixture context`;
      const board=filename==='board-body.md'||filename.startsWith('board-note')||filename.startsWith('board-lesson');
      await h.pool.query(`INSERT INTO ${q('issue')}(owner_id,repo_id,number,title,body,state,owner_alias_id,is_board,reply_in) VALUES($1,$2,$3,$4,$5,'running',$6,$7,$8)`,[h.bootstrap.ownerId,repoId,number,filename,baseline,author.id,board,isBody?e['REPLY-IN']??null:null]);
      if(board) await h.pool.query(`UPDATE ${q('repo')} SET board_issue_id=$2 WHERE id=$1`,[repoId,number]);
      if(isBody&&e.BOARD&&number!==3) {const owner=aliases.get('p4-board')!;await h.pool.query(`INSERT INTO ${q('issue')}(owner_id,repo_id,number,title,body,state,owner_alias_id,is_board) VALUES($1,$2,3,'board',$3,'running',$4,true)`,[h.bootstrap.ownerId,repoId,`STATE:running OWNER:p4-board UPDATED:2026-10-20T00:00:00+00:00\nGOAL: board`,owner.id]);await h.pool.query(`UPDATE ${q('repo')} SET board_issue_id=3 WHERE id=$1`,[repoId]);}
      if(e['REPLY-IN']) {const targetNumber=Number(e['REPLY-IN'].split('#')[1]);if(targetNumber!==number) {const targetOwner=aliases.get(e.TO)?.id??author.id;await h.pool.query(`INSERT INTO ${q('issue')}(owner_id,repo_id,number,title,body,state,owner_alias_id) VALUES($1,$2,$3,'target',$4,'running',$5)`,[h.bootstrap.ownerId,repoId,targetNumber,baseline,targetOwner]);}}
      const refIds=new Set<string>([...refs(e.RE),...refs(e.SUPERSEDES),...refs(e.SEEN),...(e.COMPACT?[e.COMPACT]:[])].filter(id=>id!=='0'));
      if(e.TYPE==='COMPACT') {refIds.add((BigInt(e.SEEN)-1n).toString());refIds.add((BigInt(e.SEEN)-2n).toString());}
      for(const id of [...refIds].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)) {
        const kind=e.TYPE==='RELEASE'?'CLAIM':e.TYPE==='COMPACT'&&refs(e.RE).includes(id)||e.COMPACT===id?'COMPACT':'NOTE';
        const ce={FROM:`${from}/${sid}`,TO:'ALL',TYPE:kind};const text=`FROM:${from}/${sid} TO:ALL TYPE:${kind}\nfixture prerequisite ${id}`;
        await h.pool.query(`INSERT INTO ${q('comment')}(id,owner_id,repo_id,issue_number,body,envelope,author_alias_id,author_session_id,posted_by_alias_id,char_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7,$9)`,[id,h.bootstrap.ownerId,repoId,number,text,ce,author.id,author.sessionId,Array.from(text).length]);
        if(kind==='CLAIM') await h.pool.query(`INSERT INTO ${q('claim')}(owner_id,comment_id,alias_id,repo_id,issue_number,due_at) VALUES($1,$2,$3,$4,$5,'2030-01-01T00:00Z')`,[h.bootstrap.ownerId,id,author.id,repoId,number]);
      }
      const max=[...refIds].reduce((a,b)=>BigInt(a)>BigInt(b)?a:b,'999999');await h.pool.query(`UPDATE ${q('comment_counter')} SET last_id=$1`,[max]);
      if(isBody) {
        if(e.COMPACT) await h.pool.query(`UPDATE ${q('issue')} SET compact_comment_id=$3 WHERE repo_id=$1 AND number=$2`,[repoId,number,e.COMPACT]);
        const response=await h.http(`/v1/repos/tester/fixtures/issues/${number}/body`,{body:original},author.token,{method:'PATCH',headers:{'if-match':'1'}});assert.equal(response.status,200,JSON.stringify(response.body));
        assert.equal((await h.pool.query(`SELECT body FROM ${q('issue')} WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0].body,original);edited++;
      } else {
        let body=original;const metadata:Record<string,unknown>={};
        if(['DECISION','HANDOFF'].includes(e.TYPE)) metadata.compactDeferredReason='역사 고정물 문맥 시험: 선행 요약 생략';
        if(e.TYPE==='COMPACT') {
          const previous=refs(e.RE)[0]??null;if(previous) await h.pool.query(`UPDATE ${q('issue')} SET compact_comment_id=$3 WHERE repo_id=$1 AND number=$2`,[repoId,number,previous]);
          const token=randomBytes(32).toString('base64url');const samples=[...refIds].filter(id=>!previous||BigInt(id)>BigInt(previous)).slice(0,3);
          await h.pool.query(`INSERT INTO ${q('compact_packet')}(id,owner_id,repo_id,issue_number,previous_compact_id,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,'{}','2030-01-01T00:00Z')`,[randomUUID(),h.bootstrap.ownerId,repoId,number,previous,e.SEEN,sha256('fixture'),sha256(token)]);
          body=original.trimEnd()+'\ncompacted-by:p4-24-compact';Object.assign(metadata,{compactPacketToken:token,sampledIds:samples,compactedBy:'p4-24-compact'});
        }
        const response=await h.http(`/v1/repos/tester/fixtures/issues/${number}/comments`,{body,...metadata},author.token);assert.equal(response.status,201,filename+JSON.stringify(response.body));
        const row=(await h.pool.query(`SELECT body FROM ${q('comment')} WHERE id=$1`,[response.body.commentId])).rows[0];assert.equal(row.body,body);posted++;
      }
      assert.deepEqual(h.failures,[]);
    }finally{await h.cleanup();}
  });
  assert.equal(posted,28);assert.equal(edited,4);
});
