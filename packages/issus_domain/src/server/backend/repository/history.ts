import {randomUUID} from 'node:crypto';
import type {EventTransaction} from '../event-uow/index.js';
import type {CorePrincipal} from '../authorization/index.js';
import {CoreError,requestHash} from '../command-result/index.js';
import {issueById,commentsFor,issueDiagnostics,commentView} from './index.js';

/** Canonical issue-history builder; P5 can replace this with its canonical+inbox union builder. */
export async function readIssueHistory(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number,query:Record<string,unknown>):Promise<Record<string,unknown>> {
  const issue=await issueById(tx,p,repoId,number);const limit=query.limit===undefined?100:Number(query.limit);
  if(!Number.isSafeInteger(limit)||limit<1||limit>500||query.sinceCompact!==undefined&&!['true','false'].includes(String(query.sinceCompact))) throw new CoreError(400,'INVALID_PAGINATION');
  const scope=requestHash('canonical-history',{principalId:p.id,repoId,number,sinceCompact:query.sinceCompact!=='false'});
  let snapshot:Record<string,any>,index=0;
  if(query.cursor!==undefined) {
    const token=String(query.cursor);if(!/^[0-9a-f-]{36}$/i.test(token)) throw new CoreError(409,'CURSOR_SCOPE');
    const row=(await tx.client.query(`SELECT * FROM ${tx.table('history_snapshot')} WHERE id=$1`,[token])).rows[0];
    if(!row||new Date(row.expires_at).getTime()<=tx.now.getTime()) throw new CoreError(410,'CURSOR_EXPIRED');
    if(row.principal_id!==p.id||row.scope_hash!==scope) throw new CoreError(409,'CURSOR_SCOPE');snapshot=row.snapshot;index=snapshot.index;
  } else {
    const comments=await commentsFor(tx,repoId,number),compact=comments.find(c=>c.id===issue.compact_comment_id)??null;
    const items=comments.filter(c=>query.sinceCompact==='false'||!compact||BigInt(c.id)>BigInt(compact.id)).map(commentView);
    snapshot=JSON.parse(JSON.stringify({compact:compact?commentView(compact):null,items,snapshot:{highWater:comments.at(-1)?.id??'0',revision:issue.revision},...await issueDiagnostics(tx,issue,p.kind==='session'?[p.alias.toLowerCase()]:[])}));
  }
  let nextCursor:string|null=null;
  if(index+limit<snapshot.items.length) {nextCursor=randomUUID();await tx.client.query(`INSERT INTO ${tx.table('history_snapshot')}(id,principal_id,scope_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)`,[nextCursor,p.id,scope,{...snapshot,index:index+limit},new Date(tx.now.getTime()+30*86400000)]);}
  const {index:_,...view}=snapshot;return {...view,items:snapshot.items.slice(index,index+limit),nextCursor};
}
