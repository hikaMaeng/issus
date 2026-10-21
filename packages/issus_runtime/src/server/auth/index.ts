import {randomBytes,randomUUID,timingSafeEqual,createHmac} from 'node:crypto';
import type {Principal as BrokerPrincipal,SessionVerifier} from 'agent/broker';
import type {SessionCreateRequest,SessionCreatedResponse,Actor} from 'issus_domain/common';
import {CoreError,sha256,requestHash,reserveCommand,finishCommand,requireIdempotencyKey,requireBootstrap,authorizePrincipal,aliasByName,type CorePrincipal,type EventUnitOfWork,type HttpResult} from 'issus_domain/server';

export interface RuntimePrincipal extends BrokerPrincipal {ownerId:string;aliasId?:string;expiresAt?:string;kind:'bootstrap'|'session'|'service'}
export interface AuthOptions {uow:EventUnitOfWork;sessionTtlSeconds?:number;onRevoked?:(sessionId:string)=>void|Promise<void>}
/** Both HTTP and worker adapters use this owner-scoped domain identity. */
export function corePrincipal(p:RuntimePrincipal):CorePrincipal {
  if(p.kind==='bootstrap') return {kind:'bootstrap',id:p.id,ownerId:p.ownerId,capabilities:p.capabilities};
  return {kind:'session',id:p.id,ownerId:p.ownerId,aliasId:p.aliasId!,alias:p.alias,sid:p.sid,sessionId:p.sessionId,capabilities:p.capabilities};
}
/** Token hashes only. Verify is read-only and intentionally has no positive cache. */
export class RuntimeAuth implements SessionVerifier {
  constructor(readonly options:AuthOptions) {}
  async installBootstrap(ownerName:string,tokenHash:string):Promise<CorePrincipal> {
    if(!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('bootstrap hash required');
    return this.options.uow.run(async tx=>{
      await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`issus-owner:${ownerName.toLowerCase()}`]);
      let owner=(await tx.client.query(`SELECT * FROM ${tx.table('owner')} WHERE lower(name)=lower($1)`,[ownerName])).rows[0];
      if(!owner) owner=(await tx.client.query(`INSERT INTO ${tx.table('owner')}(id,name) VALUES($1,$2) RETURNING *`,[randomUUID(),ownerName])).rows[0];
      let auth=(await tx.client.query(`SELECT * FROM ${tx.table('bootstrap_auth')} WHERE owner_id=$1`,[owner.id])).rows[0];
      if(auth&&auth.token_hash!==tokenHash) throw new Error('bootstrap already initialized with a different hash');
      if(!auth) auth=(await tx.client.query(`INSERT INTO ${tx.table('bootstrap_auth')}(id,owner_id,token_hash) VALUES($1,$2,$3) RETURNING *`,[randomUUID(),owner.id,tokenHash])).rows[0];
      return {kind:'bootstrap',id:auth.id,ownerId:owner.id,capabilities:['bootstrap','post:proxy']};
    });
  }
  async verify(token:string):Promise<RuntimePrincipal> {
    if(!token||token.length>1024) throw new CoreError(401,'UNAUTHENTICATED');const hash=sha256(token);
    return this.options.uow.read(async tx=>{
      const bootstrap=(await tx.client.query(`SELECT b.id,b.owner_id,o.name FROM ${tx.table('bootstrap_auth')} b JOIN ${tx.table('owner')} o ON o.id=b.owner_id WHERE b.token_hash=$1`,[hash])).rows[0];
      if(bootstrap) return {kind:'bootstrap',id:bootstrap.id,owner:bootstrap.name,ownerId:bootstrap.owner_id,alias:'',sid:'',sessionId:bootstrap.id,capabilities:['bootstrap','post:proxy']};
      const row=(await tx.client.query(`SELECT s.*,a.name AS alias,o.name AS owner FROM ${tx.table('session')} s JOIN ${tx.table('alias')} a ON a.id=s.alias_id JOIN ${tx.table('owner')} o ON o.id=s.owner_id WHERE (s.token_hash=$1 OR s.id IN (SELECT session_id FROM ${tx.table('browser_session')} WHERE token_hash=$1 AND expires_at>$2)) AND s.revoked_at IS NULL AND s.expires_at>$2 AND s.kind='agent' AND a.status='active'`,[hash,tx.now])).rows[0];
      if(!row) throw new CoreError(401,'UNAUTHENTICATED');
      return {kind:'session',id:row.id,ownerId:row.owner_id,owner:row.owner,aliasId:row.alias_id,alias:row.alias,sid:row.sid,sessionId:row.id,expiresAt:new Date(row.expires_at).toISOString(),capabilities:[]};
    });
  }
  forget(_token:string):void {}
  async resolveActor(actor:Actor):Promise<CorePrincipal> {
    return this.options.uow.read(async tx=>{
      if(actor.alias==='bootstrap') {const b=(await tx.client.query(`SELECT id,owner_id FROM ${tx.table('bootstrap_auth')} WHERE id=$1 AND owner_id=$2`,[actor.sessionId,actor.ownerId])).rows[0];if(!b) throw new CoreError(401,'UNAUTHENTICATED');return {kind:'bootstrap',id:b.id,ownerId:b.owner_id,capabilities:['bootstrap','post:proxy']};}
      const r=(await tx.client.query(`SELECT s.*,a.name FROM ${tx.table('session')} s JOIN ${tx.table('alias')} a ON a.id=s.alias_id WHERE s.id=$1 AND s.owner_id=$2`,[actor.sessionId,actor.ownerId])).rows[0];if(!r) throw new CoreError(401,'UNAUTHENTICATED');
      const p:CorePrincipal={kind:'session',id:r.id,ownerId:r.owner_id,aliasId:r.alias_id,alias:r.name,sid:r.sid,sessionId:r.id,capabilities:[]};await authorizePrincipal(tx,p);return p;
    });
  }
  /** v2.1 token is returned in memory once; durable result contains metadata only. */
  async createSession(p:CorePrincipal,input:SessionCreateRequest,key:string):Promise<HttpResult> {
    requireBootstrap(p);if(!input||typeof input.alias!=='string'||typeof input.sid!=='string'||!/^[a-z0-9-]{1,12}$/.test(input.sid)||Object.keys(input).some(k=>!['alias','sid','resumeFrom','reissueOf'].includes(k))||('resumeFrom' in input&&typeof input.resumeFrom!=='string')||('reissueOf' in input&&typeof input.reissueOf!=='string')) throw new CoreError(422,'INVALID_PAYLOAD');
    let revoked:string|undefined;
    const result=await this.options.uow.run(async tx=>{
      const {record,created}=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('issus.session.open',input));
      if(!created) throw new CoreError(409,'SESSION_TOKEN_NOT_REPLAYABLE',undefined,{...record.response,reissueRequired:true});
      await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[p.ownerId]);
      const alias=await aliasByName(tx,p.ownerId,input.alias);await tx.client.query(`SELECT id FROM ${tx.table('alias')} WHERE id=$1 FOR UPDATE`,[alias.id]);
      if((await tx.client.query(`SELECT 1 FROM ${tx.table('session')} WHERE alias_id=$1 AND kind='service'`,[alias.id])).rowCount) throw new CoreError(403,'SYSTEM_SESSION_FORBIDDEN');
      const current=(await tx.client.query(`SELECT * FROM ${tx.table('session')} WHERE alias_id=$1 AND revoked_at IS NULL`,[alias.id])).rows[0];
      const used=(await tx.client.query(`SELECT 1 FROM ${tx.table('session')} WHERE alias_id=$1 AND sid=$2`,[alias.id,input.sid])).rowCount;
      if(used||input.reissueOf&&(!current||current.id!==input.reissueOf)||current&&!input.reissueOf||!current&&input.reissueOf) throw new CoreError(409,'SESSION_CONFLICT');
      if(current) {revoked=current.id;await tx.client.query(`UPDATE ${tx.table('session')} SET revoked_at=$2 WHERE id=$1`,[current.id,tx.now]);tx.fact('issus.session.revoked','internal:auth',{ownerId:p.ownerId,sessionId:current.id,aliasId:alias.id,sid:current.sid,reason:'reissued'},`revoke:${current.id}`,'worker');}
      const token=randomBytes(32).toString('base64url'),sessionId=randomUUID(),expiresAt=new Date(tx.now.getTime()+(this.options.sessionTtlSeconds??86400)*1000).toISOString();
      await tx.client.query(`INSERT INTO ${tx.table('session')}(id,owner_id,alias_id,sid,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,[sessionId,p.ownerId,alias.id,input.sid,sha256(token),expiresAt]);
      const metadata={sessionId,expiresAt,alias:alias.name,sid:input.sid};await finishCommand(tx.client,tx.table('command_result'),record,{httpStatus:201,response:metadata});
      tx.fact('issus.session.opened','internal:auth',{ownerId:p.ownerId,sessionId,aliasId:alias.id,sid:input.sid,expiresAt},'session-open','worker');
      return {httpStatus:201,response:{...metadata,token} satisfies SessionCreatedResponse};
    },key,p.id);
    if(revoked) await this.options.onRevoked?.(revoked);return result;
  }
  async revoke(p:CorePrincipal,id:string,key:string):Promise<HttpResult> {
    const result=await this.options.uow.run(async tx=>{
      const {record,created}=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('issus.session.revoke',{id}));if(!created&&record.response) return {httpStatus:record.http_status!,response:record.response};
      await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[p.ownerId]);await authorizePrincipal(tx,p);
      const row=(await tx.client.query(`SELECT * FROM ${tx.table('session')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[id,p.ownerId])).rows[0];if(!row) throw new CoreError(404,'NOT_FOUND');if(p.kind!=='bootstrap'&&p.sessionId!==id) throw new CoreError(403,'FORBIDDEN');
      if(!row.revoked_at) {await tx.client.query(`UPDATE ${tx.table('session')} SET revoked_at=$2 WHERE id=$1`,[id,tx.now]);tx.fact('issus.session.revoked','internal:auth',{ownerId:p.ownerId,sessionId:id,aliasId:row.alias_id,sid:row.sid,reason:'explicit'},'session-revoke','worker');}
      const response={revoked:true,sessionId:id};await finishCommand(tx.client,tx.table('command_result'),record,{httpStatus:200,response});return {httpStatus:200,response};
    },key,p.id);await this.options.onRevoked?.(id);return result;
  }
  async browserSession(p:CorePrincipal,origin:string,key:string,bearerToken:string):Promise<{httpStatus:number;response:Record<string,unknown>;cookieToken?:string}> {
    if(p.kind!=='session') throw new CoreError(403,'FORBIDDEN');
    key=requireIdempotencyKey(key);
    const verified=await this.verify(bearerToken);if(verified.id!==p.id) throw new CoreError(403,'FORBIDDEN');
    const token=createHmac('sha256',bearerToken).update(`browser:${key}`).digest('base64url'),csrfToken=createHmac('sha256',bearerToken).update(`csrf:${key}`).digest('base64url');
    return this.options.uow.run(async tx=>{
      const {record,created}=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('issus.auth.browser-session',{origin}));
      await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[p.ownerId]);await authorizePrincipal(tx,p);
      if(!created) return {httpStatus:200,response:{csrfToken},cookieToken:token};
      const session=(await tx.client.query(`SELECT expires_at FROM ${tx.table('session')} WHERE id=$1`,[p.sessionId])).rows[0];
      await tx.client.query(`INSERT INTO ${tx.table('browser_session')}(id,session_id,token_hash,csrf_hash,expires_at,origin) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),p.sessionId,sha256(token),sha256(csrfToken),session.expires_at,origin]);
      await finishCommand(tx.client,tx.table('command_result'),record,{httpStatus:200,response:{sessionId:p.sessionId,expiresAt:session.expires_at}});return {httpStatus:200,response:{csrfToken},cookieToken:token};
    },key,p.id);
  }
  async verifyCsrf(token:string,csrf:string,origin:string):Promise<void> {
    await this.options.uow.read(async tx=>{const row=(await tx.client.query(`SELECT csrf_hash FROM ${tx.table('browser_session')} WHERE token_hash=$1 AND origin=$2 AND expires_at>$3`,[sha256(token),origin,tx.now])).rows[0];if(!row||!timingSafeEqual(Buffer.from(row.csrf_hash),Buffer.from(sha256(csrf)))) throw new CoreError(403,'CSRF_FAILED');});
  }
}
