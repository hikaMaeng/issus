import type {Router} from 'express';
import {authorizeRepo} from 'issus_domain/server';
import {endpoint,object,principal,submit,lookupRepo,page,R,type CoreHttpOptions} from '../auth/context.js';

export function installRepoRoutes(router:Router,o:CoreHttpOptions):void {
  router.post('/v1/repos',endpoint(async(req,res)=>{const x=object(req.body,['owner','slug','projectCode','autoBoard','boardOwner']);await submit(o,req,res,'issus.repo.create',{...x,autoBoard:x.autoBoard??true});}));
  router.get('/v1/repos',endpoint(async(req,res)=>{const {limit,cursor}=page(req);const p=principal(res);const data=await o.intake.uow.read(async tx=>{const rows=(await tx.client.query(`SELECT r.*,o.name AS owner FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE r.owner_id=$1 AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM ${tx.table('alias_repo')} ar WHERE ar.repo_id=r.id AND ar.alias_id=$2)) ORDER BY r.slug OFFSET $3 LIMIT $4`,[p.ownerId,p.kind==='session'?p.aliasId:null,cursor,limit+1])).rows;return {items:rows.slice(0,limit),nextCursor:rows.length>limit?String(cursor+limit):null};});res.json(data);}));
  router.get(R,endpoint(async(req,res)=>{res.json(await o.intake.uow.read(async tx=>{const repo=await lookupRepo(tx,principal(res),req);await authorizeRepo(tx,principal(res),repo.id);return repo;}));}));
}
