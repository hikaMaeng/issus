import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {EventDraft,EventEnvelope,IngressEvent} from 'agent/common';
import {createReactionWork,type EventStore,type PgmqClient,type ReactionTable} from 'agent/broker';
import {deterministicEventId} from 'agent/server';
import {CoreError} from '../command-result/index.js';
import {parseFactPayload,type FactAction,type FactPayloadMap} from '../../../common/index.js';

export interface Clock {now():Date}
export interface UowOptions {
  pool:Pool;eventStore:Pick<EventStore,'appendManyOn'>;queue:Pick<PgmqClient,'sendOn'>;
  schema?:string;clock?:Clock;reactions?:ReactionTable;queueName?:(name:string)=>string;
}
/** Same client for projections, event append and durable queue sends. No handler owns COMMIT. */
export class EventTransaction {
  readonly drafts:EventDraft[]=[];
  readonly pending:Array<{queue:string;event:IngressEvent|EventEnvelope}>=[];
  readonly now:Date;
  private flushed=false;
  constructor(readonly client:PoolClient,readonly options:UowOptions,readonly key:string= randomUUID(),readonly identityScope='global') {this.now=(options.clock??{now:()=>new Date()}).now();}
  table(name:string):string {return `${identifier(this.options.schema??'issus')}.${identifier(name)}`;}
  /** Deterministic per command and logical fact label; canonical stream always follows channel. */
  fact<A extends FactAction>(action:A,channel:string,payload:FactPayloadMap[A],label:string=action,audience:'client'|'worker'='client',kind:EventDraft['kind']='fact'):EventDraft {
    if(!parseFactPayload(action,payload).ok) throw new Error(`invalid domain fact payload: ${action}`);
    const draft:EventDraft={eventId:deterministicEventId(`${this.identityScope}:${this.key}:${label}`),eventVersion:1,kind,streamId:`channel:${channel}`,action,transactionKey:this.key,channel,correlationId:this.key,source:'server',audience,payload:payload as unknown as Record<string,unknown>,createdAt:this.now.toISOString()};
    this.drafts.push(draft);return draft;
  }
  enqueue(queue:string,event:IngressEvent|EventEnvelope):void {this.pending.push({queue,event});}
  /** Append and every configured reaction queue send are awaited inside the caller's transaction. */
  async flush():Promise<EventEnvelope[]> {
    if(this.flushed) throw new Error('transaction already flushed');
    this.flushed=true;
    const facts=await this.options.eventStore.appendManyOn(this.client,this.drafts);
    for(const fact of facts) for(const queue of this.options.reactions?.[fact.action]??[]) this.enqueue(queue,createReactionWork(fact,queue));
    for(const item of this.pending) await this.options.queue.sendOn(this.client,this.options.queueName?.(item.queue)??item.queue,item.event);
    return facts;
  }
}
export function identifier(name:string):string {if(!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('invalid SQL identifier');return `"${name}"`;}
/** Serialization, deadlock and transaction-timeout retries retain the command identity. */
export class EventUnitOfWork {
  constructor(readonly options:UowOptions) {}
  async run<T>(work:(tx:EventTransaction)=>Promise<T>,key?:string,identityScope?:string):Promise<T> {
    const commandKey=key??randomUUID();
    for(let attempt=0;;attempt++) {
      try {
        return await this.transact(work,commandKey,identityScope,false);
      } catch(error) {
        const code=(error as {code?:string}).code;
        if((code==='40001'||code==='40P01'||code==='25P04')&&attempt<3) {await new Promise(resolve=>setTimeout(resolve,[100,300,1000][attempt]));continue;}
        if(code==='23505') throw new CoreError(409,'CONFLICT');
        throw error;
      }
    }
  }
  /** Preflight and readers cannot mutate any DB object, even through an injected hook. */
  async read<T>(work:(tx:EventTransaction)=>Promise<T>):Promise<T> {
    return this.transact(work,randomUUID(),undefined,true);
  }
  /** A leased pg client needs its own error listener while pg-pool's idle listener is detached. */
  private async transact<T>(work:(tx:EventTransaction)=>Promise<T>,key:string,identityScope:string|undefined,readOnly:boolean):Promise<T> {
    const client=await this.options.pool.connect();
    let connectionError:Error|undefined,discard=false;
    const onError=(error:Error):void=>{connectionError??=error;discard=true;};
    client.on('error',onError);
    try {
      await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
      if(!readOnly) {await client.query("SET LOCAL transaction_timeout='5s'");await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='5s'");}
      const tx=new EventTransaction(client,this.options,key,identityScope),result=await work(tx);
      if(connectionError) throw connectionError;
      if(!readOnly) await tx.flush();
      if(connectionError) throw connectionError;
      await client.query('COMMIT');return result;
    } catch(error) {
      const original=connectionError??error;
      // A failed rollback must not replace FATAL 25P04 with "not queryable".
      if(!connectionError) try {await client.query('ROLLBACK');} catch {discard=true;}
      if((original as {code?:string}).code==='25P04') discard=true;
      throw original;
    } finally {
      // release(error) discards the connection and restores pg-pool's idle error listener.
      try {client.release(discard);} finally {client.removeListener('error',onError);}
    }
  }
  /** Immutable pagination may persist opaque cursor records in a repeatable-read snapshot. */
  async snapshot<T>(work:(tx:EventTransaction)=>Promise<T>):Promise<T> {return this.run(async tx=>{await tx.client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');return work(tx);});}
}
