import {classify,header,mentioned,type Classification} from '../../../common/index.js';
import type {EventTransaction,CommentRow,IssueRow} from '../../backend/index.js';

export interface Recipient {aliasId:string;alias:string;classification:Classification;ackRequired:boolean}
/** Registry/membership and explicit watchers, never live connection presence, define recipients. */
export async function commentRecipients(tx:EventTransaction,comment:CommentRow,issue:IssueRow):Promise<Recipient[]> {
 if(comment.validity!=='v2') return [];
 const h=header(comment.body),members=new Set((await tx.client.query(`SELECT alias_id FROM ${tx.table('alias_repo')} WHERE repo_id=$1`,[comment.repo_id])).rows.map(r=>r.alias_id));
 const watchers=new Set((await tx.client.query(`SELECT DISTINCT s.alias_id FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.owner_id=$1 AND b.closed_at IS NULL AND $2=ANY(b.channels)`,[comment.owner_id,`issue:${comment.repo_id}:${comment.issue_number}`])).rows.map(r=>r.alias_id));
 const aliases=(await tx.client.query<{id:string;name:string}>(`SELECT id,name FROM ${tx.table('alias')} WHERE owner_id=$1 AND status='active' ORDER BY id`,[comment.owner_id])).rows;
 return aliases.flatMap(a=>{
  if(h._from===a.name.toLowerCase()) return [];
  const direct=h._to.includes(a.name.toLowerCase()),mention=mentioned(comment.body,[a.name.toLowerCase()]);
  const candidate=direct||mention||h._cc.includes(a.name.toLowerCase())||members.has(a.id)&&(h._to.includes('all')||['HOLD','DECISION'].includes(h._type))||h._type==='COMPACT'&&issue.owner_alias_id===a.id||watchers.has(a.id)&&members.has(a.id);
  return candidate?[{aliasId:a.id,alias:a.name,classification:classify(h,comment.body,[a.name.toLowerCase()]),ackRequired:direct&&['ASK','HOLD','DECISION','HANDOFF'].includes(h._type)}]:[];
 });
}
