import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {ValidationReason} from '../../../common/index.js';

/** A safe, serializable domain rejection; SQL and secrets never enter the wire error. */
export class CoreError extends Error {
  constructor(public readonly status:number,public readonly code:string,public readonly reasons?:ValidationReason[],public readonly details?:Record<string,unknown>) {super(code);}
  response(requestId:string=randomUUID()):Record<string,unknown> {return {error:{code:this.code,...(this.reasons?{reasons:this.reasons}:{}),...(this.details?{details:this.details}:{})},posted:false,requestId};}
}
export interface HttpResult {httpStatus:number;response:Record<string,unknown>}
export interface CommandRecord {principal_id:string;idempotency_key:string;request_hash:string;operation_id:string;status:string;http_status:number|null;response:Record<string,unknown>|null}
/** Canonical JSON sorts object keys while preserving strings, arrays and submitted metadata. */
export function canonicalJson(value:unknown):string {
  if (value===null||typeof value!=='object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson((value as Record<string,unknown>)[k])}`).join(',')}}`;
}
export const sha256=(value:string):string=>createHash('sha256').update(value,'utf8').digest('hex');
export const requestHash=(action:string,payload:unknown):string=>sha256(canonicalJson({action,payload}));
export function requireIdempotencyKey(key:unknown):string {
  if(typeof key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new CoreError(400,'IDEMPOTENCY_KEY_REQUIRED');
  return key.toLowerCase();
}
export function validation(reasons:readonly (string|ValidationReason)[]):void {
  if(reasons.length) throw new CoreError(422,'VALIDATION_FAILED',reasons.map(r=>typeof r==='string'?{code:'PROTOCOL',path:'body',message:r}:r));
}
/** Reserve before any domain lock; concurrent identical submissions serialize on the primary key. */
export async function reserveCommand(client:PoolClient,table:string,principalId:string,key:string,hash:string):Promise<{record:CommandRecord;created:boolean}> {
  const inserted=await client.query(`INSERT INTO ${table}(principal_id,idempotency_key,request_hash,operation_id,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT DO NOTHING RETURNING *`,[principalId,requireIdempotencyKey(key),hash,randomUUID()]);
  const record=(await client.query<CommandRecord>(`SELECT * FROM ${table} WHERE principal_id=$1 AND idempotency_key=$2 FOR UPDATE`,[principalId,key])).rows[0];
  if(record.request_hash!==hash) throw new CoreError(409,'IDEMPOTENCY_CONFLICT');
  return {record,created:!!inserted.rowCount};
}
export const accepted=(r:CommandRecord):HttpResult=>({httpStatus:202,response:{operationId:r.operation_id,status:'queued',statusUrl:`/v1/operations/${r.operation_id}`,posted:null}});
export const recorded=(r:CommandRecord):HttpResult=>r.http_status!==null&&r.response!==null?{httpStatus:r.http_status,response:r.response}:accepted(r);
export async function finishCommand(client:PoolClient,table:string,r:CommandRecord,result:HttpResult):Promise<void> {
  await client.query(`UPDATE ${table} SET status=$3,http_status=$4,response=$5 WHERE principal_id=$1 AND idempotency_key=$2`,[r.principal_id,r.idempotency_key,result.httpStatus>=400?'failed':'done',result.httpStatus,result.response]);
}
