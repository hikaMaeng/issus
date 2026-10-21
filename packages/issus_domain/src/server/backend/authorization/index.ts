import type {Principal,Actor} from '../../../common/index.js';
import type {EventTransaction} from '../event-uow/index.js';
import {CoreError} from '../command-result/index.js';

export type CorePrincipal=Principal;
export const isBootstrap=(p:CorePrincipal):boolean=>p.kind==='bootstrap';
export function requireBootstrap(p:CorePrincipal):void {if(!isBootstrap(p)) throw new CoreError(403,'FORBIDDEN');}
export function actorOf(p:CorePrincipal):Actor {
  return p.kind==='session'?{ownerId:p.ownerId,aliasId:p.aliasId,alias:p.alias,sid:p.sid,sessionId:p.sessionId}:{ownerId:p.ownerId,aliasId:p.id,alias:'bootstrap',sid:'srv',sessionId:p.id};
}
/** Check identity again under the worker transaction, including immediate revocation. */
export async function authorizePrincipal(tx:EventTransaction,p:CorePrincipal):Promise<void> {
  if(p.kind==='bootstrap') return;
  const r=await tx.client.query(`SELECT 1 FROM ${tx.table('session')} s JOIN ${tx.table('alias')} a ON a.id=s.alias_id WHERE s.id=$1 AND s.owner_id=$2 AND s.alias_id=$3 AND s.sid=$4 AND s.revoked_at IS NULL AND s.expires_at>$5 AND a.status='active'`,[p.sessionId,p.ownerId,p.aliasId,p.sid,tx.now]);
  if(!r.rowCount) throw new CoreError(401,'UNAUTHENTICATED');
}
export async function authorizeRepo(tx:EventTransaction,p:CorePrincipal,repoId:string):Promise<void> {
  const row=(await tx.client.query(`SELECT owner_id FROM ${tx.table('repo')} WHERE id=$1`,[repoId])).rows[0];
  if(!row||row.owner_id!==p.ownerId) throw new CoreError(404,'NOT_FOUND');
  if(p.kind==='session'&&!(await tx.client.query(`SELECT 1 FROM ${tx.table('alias_repo')} WHERE alias_id=$1 AND repo_id=$2`,[p.aliasId,repoId])).rowCount) throw new CoreError(403,'FORBIDDEN');
}
export async function requireOwner(tx:EventTransaction,p:CorePrincipal,ownerAliasId:string):Promise<void> {
  if(isBootstrap(p)||(p.kind==='session'&&p.aliasId===ownerAliasId)) return;
  const r=await tx.client.query(`SELECT 1 FROM ${tx.table('owner')} WHERE id=$1 AND supervisor_alias_id=$2`,[p.ownerId,p.kind==='session'?p.aliasId:null]);
  if(!r.rowCount) throw new CoreError(403,'FORBIDDEN');
}
