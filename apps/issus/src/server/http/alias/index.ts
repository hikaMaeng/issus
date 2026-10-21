import type {Router} from 'express';
import {CoreError,checkAliasRegistry} from 'issus_domain/server';
import {endpoint,object,principal,param,submit,type CoreHttpOptions} from '../auth/context.js';

export function installAliasRoutes(router:Router,o:CoreHttpOptions):void {
  const ownerCheck=async(req:any,res:any)=>o.intake.uow.read(async tx=>{const p=principal(res);const owner=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];if(!owner||owner.name.toLowerCase()!==param(req,'owner').toLowerCase()) throw new CoreError(404,'NOT_FOUND');});
  router.post('/v1/owners/:owner/aliases/check',endpoint(async(req,res)=>{await ownerCheck(req,res);const x=object(req.body,['name','deep']);if(typeof x.name!=='string'||'deep' in x&&typeof x.deep!=='boolean') throw new CoreError(422,'INVALID_PAYLOAD');res.json(await o.intake.uow.read(tx=>checkAliasRegistry(tx,principal(res),x.name)));}));
  router.post('/v1/owners/:owner/aliases',endpoint(async(req,res)=>{await ownerCheck(req,res);const x=object(req.body,['name','role','model','scope','repos','announcementIssue','announcementBody']);await submit(o,req,res,'issus.alias.register',{...x,owner:param(req,'owner')});}));
  router.post('/v1/aliases/:id/rename',endpoint(async(req,res)=>{const x=object(req.body,['newName','announcementIssue','announcementBody']);await submit(o,req,res,'issus.alias.rename',{...x,aliasId:param(req,'id')});}));
}
