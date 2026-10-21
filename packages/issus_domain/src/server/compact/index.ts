import {authorizePrincipal,requireOwner,issueById,reserveCommand,recorded,finishCommand,requestHash,requireIdempotencyKey,sha256,CoreError,type CorePrincipal,type EventUnitOfWork,type HttpResult,type ReactionCoordinates} from '../backend/index.js';
import type {CompactPacket,CompactPurpose,CompactStatus} from '../../common/index.js';
import {readCompactStatus,refreshCompactSegment,lockCompactIssue,applyCompactReaction} from './segment/index.js';
import {issueCompactPacket,preparedPacketToken,type PacketSnapshot} from './packet/index.js';
export * from './segment/index.js';
export * from './segment/history.js';
export * from './packet/index.js';
export * from './publication/index.js';

/** P6 control/read service; comment publication always uses P4's existing submitter. */
export class CompactService {
  constructor(readonly uow:EventUnitOfWork) {}
  status(p:CorePrincipal,repoId:string,number:number):Promise<CompactStatus> {return this.uow.read(async tx=>{await authorizePrincipal(tx,p);return readCompactStatus(tx,p,repoId,number);});}
  packet(p:CorePrincipal,repoId:string,number:number):Promise<CompactPacket|null> {return this.uow.snapshot(tx=>issueCompactPacket(tx,p,repoId,number));}
  /** Like session control, use P4's durable idempotency store; never persist raw packet tokens there. */
  async prepare(p:CorePrincipal,repoId:string,number:number,purpose:CompactPurpose,key:string):Promise<HttpResult> {
    requireIdempotencyKey(key);
    if(!['routine','before-decision','before-handoff','before-close'].includes(purpose)) throw new CoreError(422,'COMPACT_PURPOSE');
    return this.uow.snapshot(async tx=>{
      await authorizePrincipal(tx,p);await requireOwner(tx,p,(await issueById(tx,p,repoId,number)).owner_alias_id);
      const {record,created}=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('compact.prepare',{repoId,number,purpose}));
      if(!created) {
        if(record.http_status===204) return recorded(record);
        const stored=(await tx.client.query(`SELECT * FROM ${tx.table('compact_packet')} WHERE id=$1 AND owner_id=$2 AND repo_id=$3 AND issue_number=$4`,[record.response?.packetId,p.ownerId,repoId,number])).rows[0];
        if(!stored) throw new CoreError(410,'COMPACT_PACKET_EXPIRED');
        return {httpStatus:record.http_status!,response:{...(stored.snapshot as PacketSnapshot).packet,packetHash:stored.packet_hash,packetToken:preparedPacketToken(record.operation_id,stored.id),status:record.response?.status}};
      }
      const issue=await lockCompactIssue(tx,p.ownerId,repoId,number);await requireOwner(tx,p,issue.owner_alias_id);
      const status=await refreshCompactSegment(tx,issue,purpose),packet=await issueCompactPacket(tx,p,repoId,number,record.operation_id);
      const result:HttpResult=packet?{httpStatus:201,response:{...packet,status}}:{httpStatus:204,response:{}};
      const packetId=packet?(await tx.client.query(`SELECT id FROM ${tx.table('compact_packet')} WHERE token_hash=$1`,[sha256(packet.packetToken)])).rows[0].id:undefined;
      await finishCommand(tx.client,tx.table('command_result'),record,{httpStatus:result.httpStatus,response:packet?{packetId,status}: {}});
      return result;
    });
  }
  react(input:ReactionCoordinates):Promise<boolean> {return this.uow.run(tx=>applyCompactReaction(tx,input),input.sourceEventId,'compact.segment.v1');}
}
