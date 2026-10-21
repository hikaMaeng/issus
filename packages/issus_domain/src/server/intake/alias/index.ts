import {randomUUID,randomBytes} from 'node:crypto';
import {checkAlias,aliasOk,aliasCollisions,type AliasRegisterRequest,type AliasRenameRequest} from '../../../common/index.js';
import {CoreError,validation,sha256,requireBootstrap,requireOwner,aliasByName,issueById,authorizeRepo,rewriteBody,issueChannel,type IssueRow,type AliasRow,type CorePrincipal,type EventTransaction,actorOf} from '../../backend/index.js';
import {postComment} from '../comment/index.js';

export async function checkAliasRegistry(tx:EventTransaction,p:CorePrincipal,name:string):Promise<{available:boolean;collisions:ReturnType<typeof aliasCollisions>}> {
  validation(checkAlias(name));
  if(!aliasOk(name)) throw new CoreError(422,'ALIAS_SYNTAX');
  const all=(await tx.client.query(`SELECT id,name FROM ${tx.table('alias')} WHERE owner_id=$1 ORDER BY id`,[p.ownerId])).rows;
  const collisions=aliasCollisions(name,all.map(a=>({alias:a.name,evidence:[a.id]})));return {available:collisions.length===0,collisions};
}
export async function insertAlias(tx:EventTransaction,p:CorePrincipal,name:string,role='',model='',scope=''):Promise<string> {
  const checked=await checkAliasRegistry(tx,p,name);if(!checked.available) throw new CoreError(409,'ALIAS_CONFLICT',undefined,{collisions:checked.collisions});
  const id=randomUUID();await tx.client.query(`INSERT INTO ${tx.table('alias')}(id,owner_id,name,folded_name,role,model,scope) VALUES($1,$2,$3,lower($3),$4,$5,$6)`,[id,p.ownerId,name,role,model,scope]);return id;
}
/** System identities are reserved before board creation and never expose a usable external token. */
export async function reserveSystem(tx:EventTransaction,p:CorePrincipal,projectCode:string):Promise<string> {
  const id=await insertAlias(tx,p,`${projectCode}-system`,'system','service','repo bootstrap');
  await tx.client.query(`INSERT INTO ${tx.table('session')}(id,owner_id,alias_id,sid,token_hash,expires_at,kind) VALUES($1,$2,$3,'srv',$4,'infinity','service')`,[randomUUID(),p.ownerId,id,sha256(randomBytes(32).toString('hex'))]);return id;
}
async function announcement(tx:EventTransaction,p:CorePrincipal,repos:string[],announcementIssue:AliasRegisterRequest['announcementIssue']):Promise<ReturnType<typeof issueById>> {
  const repoId=announcementIssue?.repoId??repos[0];if(!repoId) throw new CoreError(422,'ANNOUNCEMENT_REQUIRED');
  await authorizeRepo(tx,p,repoId);const repo=(await tx.client.query(`SELECT board_issue_id FROM ${tx.table('repo')} WHERE id=$1`,[repoId])).rows[0];
  const number=announcementIssue?.issueNumber??repo.board_issue_id;if(!number) throw new CoreError(422,'ANNOUNCEMENT_REQUIRED');
  return issueById(tx,p,repoId,number,true);
}
export async function registerAlias(tx:EventTransaction,p:CorePrincipal,input:AliasRegisterRequest):Promise<Record<string,unknown>> {
  requireBootstrap(p);const owner=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];if(owner.name.toLowerCase()!==input.owner.toLowerCase()) throw new CoreError(403,'FORBIDDEN');
  const issue=await announcement(tx,p,input.repos,input.announcementIssue);for(const repoId of input.repos) await authorizeRepo(tx,p,repoId);
  const id=await insertAlias(tx,p,input.name,input.role,input.model,input.scope);
  for(const repoId of [...new Set(input.repos)]) await tx.client.query(`INSERT INTO ${tx.table('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[p.ownerId,id,repoId]);
  if(!input.announcementBody.startsWith(`FROM:${input.name}/`)||!input.announcementBody.split('\n')[0].includes('TYPE:ALIAS')) throw new CoreError(422,'ALIAS_ANNOUNCEMENT');
  const posted=await postComment(tx,p,issue,{body:input.announcementBody});
  for(const repoId of [...new Set([...input.repos,issue.repo_id])]) tx.fact('issus.alias.registered',`repo:${repoId}:all`,{ownerId:p.ownerId,repoId,aliasId:id,name:input.name,repos:input.repos,role:input.role,scope:input.scope,actor:actorOf(p)},`alias:${id}:${repoId}`);
  return {aliasId:id,name:input.name,commentId:posted.commentId,posted:true};
}
export async function renameAlias(tx:EventTransaction,p:CorePrincipal,input:AliasRenameRequest):Promise<Record<string,unknown>> {
  const old=(await tx.client.query<AliasRow>(`SELECT * FROM ${tx.table('alias')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[input.aliasId,p.ownerId])).rows[0];if(!old) throw new CoreError(404,'NOT_FOUND');
  await requireOwner(tx,p,old.id);if(old.status!=='active') throw new CoreError(409,'ALIAS_RENAMED');
  if((await tx.client.query(`SELECT 1 FROM ${tx.table('session')} WHERE alias_id=$1 AND kind='service'`,[old.id])).rowCount) throw new CoreError(403,'SYSTEM_ALIAS_RESERVED');
  const repos=(await tx.client.query(`SELECT repo_id FROM ${tx.table('alias_repo')} WHERE alias_id=$1 ORDER BY repo_id`,[old.id])).rows.map(r=>r.repo_id as string);
  const issue=await announcement(tx,p,repos,input.announcementIssue);const checked=await checkAliasRegistry(tx,p,input.newName);if(!checked.available) throw new CoreError(409,'ALIAS_CONFLICT',undefined,{collisions:checked.collisions});
  if(!input.announcementBody.split('\n')[0].includes('TYPE:ALIAS')) throw new CoreError(422,'ALIAS_ANNOUNCEMENT');
  const posted=await postComment(tx,p,issue,{body:input.announcementBody});
  const tombstone=randomUUID();
  // Stable id remains the seat for existing deliveries, sessions, OWNER and memberships.
  await tx.client.query(`UPDATE ${tx.table('alias')} SET name=$2,folded_name=lower($2) WHERE id=$1`,[old.id,input.newName]);
  await tx.client.query(`INSERT INTO ${tx.table('alias')}(id,owner_id,name,folded_name,status,renamed_to,role,model,scope) VALUES($1,$2,$3,lower($3),'renamed',$4,$5,$6,$7)`,[tombstone,p.ownerId,old.name,old.id,old.role,old.model,old.scope]);
  const owned=(await tx.client.query<IssueRow>(`SELECT * FROM ${tx.table('issue')} WHERE owner_alias_id=$1 ORDER BY repo_id,number FOR UPDATE`,[old.id])).rows;
  for(const ownedIssue of owned) {
    const body=rewriteBody(ownedIssue,{owner:input.newName},tx.now);
    await tx.client.query(`UPDATE ${tx.table('issue')} SET body=$3,revision=revision+1,updated_at=$4 WHERE repo_id=$1 AND number=$2`,[ownedIssue.repo_id,ownedIssue.number,body,tx.now]);
    tx.fact('issus.issue.body.edited',issueChannel(ownedIssue.repo_id,ownedIssue.number),{ownerId:p.ownerId,repoId:ownedIssue.repo_id,issueNumber:ownedIssue.number,revision:ownedIssue.revision+1,previousRevision:ownedIssue.revision,body,reason:'alias-rename',actor:actorOf(p)},`rename-owner:${ownedIssue.repo_id}:${ownedIssue.number}`);
  }
  for(const repoId of repos) tx.fact('issus.alias.renamed',`repo:${repoId}:all`,{ownerId:p.ownerId,repoId,aliasId:old.id,name:input.newName,oldName:old.name,repos,role:old.role,scope:old.scope,actor:actorOf(p)},`rename:${old.id}:${repoId}`);
  return {aliasId:old.id,name:input.newName,oldName:old.name,commentId:posted.commentId,posted:true};
}
