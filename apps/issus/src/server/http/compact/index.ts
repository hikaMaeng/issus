import type {Router,Response} from 'express';
import {CompactService,CoreError} from 'issus_domain/server';
import type {CompactPacket,CompactPurpose} from 'issus_domain/common';
import {endpoint,object,principal,repoId,param,idempotency,I,type CoreHttpOptions} from '../auth/context.js';

/** JSON is the CLI --out/sidecar source; markdown response carries opaque evidence in response headers. */
function sendPacket(res:Response,packet:CompactPacket|null,format:unknown):void {
  res.setHeader('Cache-Control','no-store');
  if(!packet) {res.status(204).end();return;}
  if(format==='markdown') {
    res.setHeader('X-Compact-Packet-Token',packet.packetToken);res.setHeader('X-Compact-Packet-Hash',packet.packetHash);
    res.setHeader('X-Compact-Through-Id',packet.throughId);res.setHeader('X-Compact-Snapshot-Revision',String(packet.snapshotRevision));
    res.type('text/markdown; charset=utf-8').send(packet.markdown);
  } else res.json(packet);
}

/** Mount after P4 coreAuthentication and before coreHttpError/static fallback. No alternate post route. */
export function installCompactRoutes(router:Router,o:CoreHttpOptions,service=new CompactService(o.intake.uow)):void {
  router.get(`${I}/compact/status`,endpoint(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await service.status(principal(res),await repoId(o,req,res),Number(param(req,'number'))));}));
  router.get(`${I}/compact/packet`,endpoint(async(req,res)=>{
    const format=req.query.format??'json';if(!['json','markdown'].includes(String(format))) throw new CoreError(400,'COMPACT_FORMAT');
    sendPacket(res,await service.packet(principal(res),await repoId(o,req,res),Number(param(req,'number'))),format);
  }));
  router.post(`${I}/compact/prepare`,endpoint(async(req,res)=>{
    const x=object(req.body,['purpose']);if(typeof x.purpose!=='string'||!['routine','before-decision','before-handoff','before-close'].includes(x.purpose)) throw new CoreError(422,'COMPACT_PURPOSE');
    const result=await service.prepare(principal(res),await repoId(o,req,res),Number(param(req,'number')),x.purpose as CompactPurpose,idempotency(req));
    res.setHeader('Cache-Control','no-store');if(result.httpStatus===204) res.status(204).end();else res.status(result.httpStatus).json(result.response);
  }));
}
