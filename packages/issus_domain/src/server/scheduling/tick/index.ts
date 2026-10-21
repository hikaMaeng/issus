import {CoreError,type EventUnitOfWork,type EventTransaction} from '../../backend/index.js';
import {lockDeliveryOwner,type DeliveryRow} from '../../delivery/receipt/model.js';
import {legacyPendingDelivery,cancelDeadline} from '../deadline/index.js';
import {escalateDelivery} from '../escalation/index.js';

/** Short scans claim a bounded batch; no lookback cutoff or in-worker ACK wait. */
export class TickService {
 constructor(readonly uow:EventUnitOfWork) {}
 private async current(tx:EventTransaction):Promise<Date> {return this.uow.options.clock?tx.now:new Date((await tx.client.query('SELECT now() AS now')).rows[0].now);}
 async tick(slot:string):Promise<{scanned:number;overdue:number;cancelled:number;backlog:number;oldestLagMs:number}> {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(slot)||!Number.isFinite(Date.parse(slot))||Date.parse(slot)%5000!==0) throw new CoreError(422,'INVALID_TICK_SLOT');
  const ids=await this.uow.read(async tx=>(await tx.client.query(`SELECT kind,entity_id,generation FROM ${tx.table('schedule')} WHERE kind IN ('delivery','mention') AND state='pending' AND run_at<=$1 ORDER BY run_at,entity_id LIMIT 100`,[await this.current(tx)])).rows);
  let overdue=0,cancelled=0;
  for(const item of ids) {
   const result=await this.uow.run(async tx=>{
    const owner=(await tx.client.query(`SELECT owner_id FROM ${tx.table('delivery')} WHERE id=$1`,[item.entity_id])).rows[0];if(!owner) return 'none';
    await lockDeliveryOwner(tx,owner.owner_id);
    const now=await this.current(tx);
    const schedule=(await tx.client.query(`SELECT * FROM ${tx.table('schedule')} WHERE kind=$4 AND entity_id=$1 AND generation=$2 AND state='pending' AND run_at<=$3 FOR UPDATE SKIP LOCKED`,[item.entity_id,item.generation,now,item.kind])).rows[0];if(!schedule) return 'none';
    const d=(await tx.client.query<DeliveryRow>(`SELECT * FROM ${tx.table('delivery')} WHERE id=$1 FOR UPDATE`,[item.entity_id])).rows[0];
    if(!await legacyPendingDelivery(tx,d,item.kind==='mention')) {await cancelDeadline(tx,d);return 'cancelled';}
    await tx.client.query(`UPDATE ${tx.table('schedule')} SET state='done' WHERE kind=$3 AND entity_id=$1 AND generation=$2`,[d.id,item.generation,item.kind]);
    if(item.kind==='mention') {
     await escalateDelivery(tx,d,`mention-pending:${item.generation}`);
     await tx.client.query(`INSERT INTO ${tx.table('schedule')}(kind,entity_id,generation,run_at) VALUES('mention',$1,$2,$3) ON CONFLICT DO NOTHING`,[d.id,item.generation+1,new Date(now.getTime()+900000)]);
    } else if(d.attempt<3) {
     tx.fact('issus.delivery.overdue','internal:delivery',{ownerId:d.owner_id,deliveryId:d.id,directiveId:d.comment_id!,ackBy:new Date(d.ack_by!).toISOString(),attempt:d.attempt+1,overdueAt:now.toISOString()},`overdue:${d.id}:${d.attempt+1}`,'worker');
    } else {
     await escalateDelivery(tx,d,`digest:${item.generation}`);
     const next=new Date(now.getTime()+900000);
     await tx.client.query(`INSERT INTO ${tx.table('schedule')}(kind,entity_id,generation,run_at,attempt) VALUES('delivery',$1,$2,$3,3) ON CONFLICT DO NOTHING`,[d.id,item.generation+1,next]);
     await tx.client.query(`UPDATE ${tx.table('delivery')} SET next_attempt_at=$2 WHERE id=$1`,[d.id,next]);
    }
    return 'overdue';
   },`tick:${item.entity_id}:${item.generation}`,'p5-scheduler');
   if(result==='overdue') overdue++;if(result==='cancelled') cancelled++;
  }
  const metrics=await this.uow.read(async tx=>(await tx.client.query(`SELECT count(*)::int AS backlog,COALESCE(EXTRACT(epoch FROM ($1::timestamptz-min(run_at)))*1000,0)::float AS lag FROM ${tx.table('schedule')} WHERE state='pending' AND run_at<=$1`,[await this.current(tx)])).rows[0]);
  return {scanned:ids.length,overdue,cancelled,backlog:metrics.backlog,oldestLagMs:Math.max(0,metrics.lag)};
 }
}
