import {CoreError,requireBootstrap,aliasByName,issueById,rewriteBody,issueChannel,envelopeTime,splitBodyHeader,type EventTransaction,type CorePrincipal} from '../../backend/index.js';
import {insertAlias} from '../alias/index.js';
import {checkBodyContext} from '../issue/index.js';

/** Exactly one durable board per repository; an existing closed board must be explicitly reopened. */
export async function ensureBoard(tx:EventTransaction,p:CorePrincipal,input:{repoId:string;boardOwner:string;body?:string}):Promise<{created:boolean;number:number;revision:number}> {
  requireBootstrap(p);
  const repo=(await tx.client.query(`SELECT * FROM ${tx.table('repo')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[input.repoId,p.ownerId])).rows[0];if(!repo) throw new CoreError(404,'NOT_FOUND');
  if(repo.board_issue_id) {const board=await issueById(tx,p,repo.id,repo.board_issue_id);if(!board.is_open) throw new CoreError(409,'BOARD_UNAVAILABLE');return {created:false,number:board.number,revision:board.revision};}
  let ownerId:string;
  const existing=(await tx.client.query(`SELECT id FROM ${tx.table('alias')} WHERE owner_id=$1 AND folded_name=lower($2) AND status='active'`,[p.ownerId,input.boardOwner])).rows[0];
  ownerId=existing?.id??await insertAlias(tx,p,input.boardOwner,'board','','repository board');
  const n=repo.next_issue_number;
  const body=input.body??`STATE:running OWNER:${input.boardOwner} UPDATED:${envelopeTime(tx.now)}\nGOAL: 저장소 공통 게시판.\nROSTER: ${input.boardOwner}`;
  const parsed=await checkBodyContext(tx,p,repo.id,body);
  if((await aliasByName(tx,p.ownerId,parsed.OWNER)).id!==ownerId||parsed.STATE!=='running') throw new CoreError(422,'BOARD_OWNER');
  const header=splitBodyHeader(body),boardBody=header.line+` BOARD:#${n}`+header.tail;
  await tx.client.query(`INSERT INTO ${tx.table('issue')}(owner_id,repo_id,number,title,body,state,owner_alias_id,is_board,updated_at) VALUES($1,$2,$3,$4,$5,'running',$6,true,$7)`,[p.ownerId,repo.id,n,'[BOARD] 저장소 공통 게시판',boardBody,ownerId,tx.now]);
  await tx.client.query(`UPDATE ${tx.table('repo')} SET next_issue_number=next_issue_number+1,board_issue_id=$2 WHERE id=$1`,[repo.id,n]);
  await tx.client.query(`INSERT INTO ${tx.table('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[p.ownerId,ownerId,repo.id]);
  const issues=(await tx.client.query(`SELECT * FROM ${tx.table('issue')} WHERE repo_id=$1 AND number<>$2 ORDER BY number FOR UPDATE`,[repo.id,n])).rows;
  for(const issue of issues) {const updated=rewriteBody(issue,{board:`#${n}`},tx.now);await tx.client.query(`UPDATE ${tx.table('issue')} SET body=$3,revision=revision+1,updated_at=$4 WHERE repo_id=$1 AND number=$2`,[repo.id,issue.number,updated,tx.now]);tx.fact('issus.issue.body.edited',issueChannel(repo.id,issue.number),{ownerId:p.ownerId,repoId:repo.id,issueNumber:issue.number,body:updated,previousRevision:issue.revision,revision:issue.revision+1,reason:'board-ensure',actor:{ownerId:p.ownerId,aliasId:ownerId,alias:input.boardOwner,sid:'srv',sessionId:p.id}},`board-pointer:${issue.number}`);}
  tx.fact('issus.board.created',`repo:${repo.id}:all`,{ownerId:p.ownerId,repoId:repo.id,issueNumber:n,ownerAliasId:ownerId,title:'[BOARD] 저장소 공통 게시판',body:boardBody});
  return {created:true,number:n,revision:1};
}
