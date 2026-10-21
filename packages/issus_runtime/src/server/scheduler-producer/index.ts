import type {Pool} from 'pg';
import {EventStore,PgmqClient,type Service} from 'agent/broker';
import type {EventDraft} from 'agent/common';
import {deterministicEventId} from 'agent/server';
import {QUEUES} from 'issus_domain/common';
import type {Clock} from 'issus_domain/server';

/** UTC five-second slot is also the producer's durable dedupe generation. */
export const tickSlot=(now:Date):string=>new Date(Math.floor(now.getTime()/5000)*5000).toISOString();
export interface ProducerOptions {pool:Pool;schema?:string;queueName?:(name:string)=>string;clock?:Clock;onError?:(error:unknown)=>void}
/** A transaction advisory lock elects one short producer; schedule prevents same-slot resend after restart. */
export async function produceTick(options:ProducerOptions):Promise<boolean> {
 const schema=options.schema??'issus';if(!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('invalid schema');
 const c=await options.pool.connect();
 try {
  await c.query('BEGIN');
  const locked=(await c.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked`,[`issus-tick:${schema}`])).rows[0].locked;
  if(!locked) {await c.query('ROLLBACK');return false;}
  const now=options.clock?.now()??new Date((await c.query('SELECT now() AS now')).rows[0].now),slot=tickSlot(now);
  const owner=(await c.query(`SELECT id FROM "${schema}".owner ORDER BY id LIMIT 1`)).rows[0];
  if(!owner) {await c.query('ROLLBACK');return false;}
  const inserted=await c.query(`INSERT INTO "${schema}".schedule(kind,entity_id,generation,run_at,state) VALUES('clock',$1::text,0,$1::text::timestamptz,'done') ON CONFLICT DO NOTHING RETURNING entity_id`,[slot]);
  if(!inserted.rowCount) {await c.query('COMMIT');return false;}
  const id=deterministicEventId(`issus-clock:${schema}:${slot}`);
  const event:EventDraft={eventId:id,eventVersion:1,kind:'command',streamId:'channel:internal:schedule',action:'issus.clock.tick',transactionKey:id,correlationId:id,channel:'internal:schedule',source:'scheduler',audience:'worker',createdAt:now.toISOString(),payload:{ownerId:owner.id,slot}};
  // The consumer's generic ingress converter reuses this canonical id, preserving scheduler provenance.
  await new EventStore(options.pool).appendManyOn(c,[event]);
  await new PgmqClient(options.pool).sendOn(c,options.queueName?.(QUEUES.schedule)??QUEUES.schedule,event);
  await c.query('COMMIT');return true;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
/** No overlapping timer jobs and no waiting for ACK inside the producer. */
export function createSchedulerProducer(options:ProducerOptions):Service {
 let timer:ReturnType<typeof setInterval>|undefined,active:Promise<unknown>|undefined;
 const once=()=>{if(active) return;active=produceTick(options).catch(e=>options.onError?.(e)).finally(()=>{active=undefined;});};
 return {async start(){once();timer=setInterval(once,5000);},async stop(){if(timer) clearInterval(timer);await active;}};
}
