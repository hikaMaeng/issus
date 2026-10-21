import type {EventTransaction} from './index.js';
import {CoreError} from '../command-result/index.js';

export interface ReactionCoordinates {sourceEventId:string;sourceStreamId:string;sourceSequence:string;action:string;payload:{ownerId:string}}
export interface CanonicalFact {eventId:string;streamId:string;sequence:string;action:string;payload:Record<string,unknown>;createdAt:Date}
/** Resolve the source fact, never substitute the consumed reaction command's own identity. */
export async function verifyReactionSource(tx:EventTransaction,input:ReactionCoordinates,ownerId:string):Promise<CanonicalFact> {
  if(!input.sourceEventId||!input.sourceStreamId||!/^\d+$/.test(input.sourceSequence??'')||input.payload.ownerId!==ownerId) throw new CoreError(422,'REACTION_SOURCE_INVALID');
  const source=(await tx.client.query(`SELECT event_id,stream_id,sequence,action,payload,created_at,kind FROM event_store WHERE event_id=$1`,[input.sourceEventId])).rows[0];
  if(!source||source.stream_id!==input.sourceStreamId||String(source.sequence)!==input.sourceSequence||source.action!==input.action||source.payload.ownerId!==ownerId||!['fact','failure'].includes(source.kind)) throw new CoreError(422,'REACTION_SOURCE_INVALID');
  return {eventId:source.event_id,streamId:source.stream_id,sequence:String(source.sequence),action:source.action,payload:source.payload,createdAt:new Date(source.created_at)};
}
/** The projection mark, callback writes and facts commit together; false means already applied. */
export async function applyProjection(tx:EventTransaction,name:string,input:ReactionCoordinates,ownerId:string,work:(fact:CanonicalFact)=>Promise<void>):Promise<boolean> {
  const fact=await verifyReactionSource(tx,input,ownerId);const inserted=await tx.client.query(`INSERT INTO ${tx.table('projection_applied')}(projection_name,source_event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING source_event_id`,[name,fact.eventId]);
  if(!inserted.rowCount) return false;await work(fact);return true;
}
