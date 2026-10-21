import {randomUUID} from 'node:crypto';
import {CoreError,requireBootstrap,actorOf,type CorePrincipal,type EventTransaction} from '../../backend/index.js';
import {reserveSystem} from '../alias/index.js';
import {ensureBoard} from '../board/index.js';
import {postComment} from '../comment/index.js';
import {issueById} from '../../backend/index.js';

export async function createRepo(tx:EventTransaction,p:CorePrincipal,input:{owner:string;slug:string;projectCode:string;autoBoard:boolean;boardOwner?:string}):Promise<Record<string,unknown>> {
  requireBootstrap(p);if(!/^[a-z0-9]{2,6}$/.test(input.projectCode)||!/^[a-zA-Z0-9_.-]+$/.test(input.slug)) throw new CoreError(422,'REPO_INVALID');
  const owner=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];if(!owner||owner.name.toLowerCase()!==input.owner.toLowerCase()) throw new CoreError(403,'FORBIDDEN');
  const id=randomUUID();const systemId=await reserveSystem(tx,p,input.projectCode);
  await tx.client.query(`INSERT INTO ${tx.table('repo')}(id,owner_id,slug,project_code,auto_board) VALUES($1,$2,$3,$4,$5)`,[id,p.ownerId,input.slug,input.projectCode,input.autoBoard]);
  await tx.client.query(`INSERT INTO ${tx.table('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[p.ownerId,systemId,id]);
  tx.fact('issus.repo.created',`repo:${id}:all`,{ownerId:p.ownerId,repoId:id,slug:input.slug,projectCode:input.projectCode,autoBoard:input.autoBoard,actor:actorOf(p),version:1});
  tx.fact('issus.alias.registered',`repo:${id}:all`,{ownerId:p.ownerId,repoId:id,aliasId:systemId,name:`${input.projectCode}-system`,repos:[id],role:'system',model:'service',scope:'repo bootstrap',actor:actorOf(p)},'system-registered');
  let board:Awaited<ReturnType<typeof ensureBoard>>|undefined;
  if(input.autoBoard) {
    const boardOwner=input.boardOwner??`${input.projectCode}-board`;
    board=await ensureBoard(tx,p,{repoId:id,boardOwner});const issue=await issueById(tx,p,id,board.number,true);
    const boardAlias=(await tx.client.query(`SELECT role,model,scope FROM ${tx.table('alias')} WHERE id=$1`,[issue.owner_alias_id])).rows[0];
    tx.fact('issus.alias.registered',`repo:${id}:all`,{ownerId:p.ownerId,repoId:id,aliasId:issue.owner_alias_id,name:boardOwner,repos:[id],role:boardAlias.role,model:boardAlias.model,scope:boardAlias.scope,actor:actorOf(p)},'board-registered');
    for(const name of [`${input.projectCode}-system`,boardOwner]) await postComment(tx,p,issue,{body:`FROM:${name}/by-${input.projectCode}-system TO:ALL TYPE:ALIAS\n${name} | 저장소 예약 별칭 | service | bootstrap | srv\n---\n근거: repo bootstrap`});
  }
  return {repoId:id,owner:input.owner,slug:input.slug,projectCode:input.projectCode,...(board?{board}:{}),posted:true};
}
