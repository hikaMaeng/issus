import {header, type InboxItem, type InboxResponse} from 'issus_domain/common';
import {InboxModel, ClientError, OperationTimeout, type IssusClient} from 'issus_domain/front';

/** Uncertain outcomes freeze the original payload/key; only definite 4xx permits a new attempt. */
export class DeliveryWrite {
  pending?: {path:string;body:unknown;key:string;operationId?:string};
  async run<T>(client:IssusClient,path:string,body:unknown,onAccepted:(id:string)=>void):Promise<T> {
    const attempt=this.pending??={path,body:structuredClone(body),key:crypto.randomUUID()};
    try {const result=await client.write<T>(attempt.path,{method:'POST',key:attempt.key,body:attempt.body,onAccepted:accepted=>{attempt.operationId=accepted.operationId;onAccepted(accepted.operationId);}});this.pending=undefined;return result;}
    catch(error){if(error instanceof ClientError&&error.status>=400&&error.status<500)this.pending=undefined;if(error instanceof OperationTimeout){attempt.operationId=error.operationId;onAccepted(error.operationId);}throw error;}
  }
}

/** Only canonical source coordinates identify the issue; an ID is never invented. */
export function deliveryIssue(item: InboxItem): number|undefined {
  const raw = /(?:^|:)issue:[0-9a-f-]+:(\d+)$/i.exec(item.sourceStreamId)?.[1];
  return raw ? Number(raw) : undefined;
}

/** Presentation order does not produce any pagination or processing cursor. */
export function orderDeliveries(items: readonly InboxItem[], response: Pick<InboxResponse,'activeHolds'|'windowPendingAck'|'globalPendingAck'>): InboxItem[] {
  const pending = new Set([...response.windowPendingAck, ...response.globalPendingAck]);
  const holds = new Set(response.activeHolds), priority = {ME: 0, CC: 1, ALL: 2, OTHER: 3};
  const group = (item: InboxItem) => item.commentId && holds.has(item.commentId) ? 0 : item.commentId && pending.has(item.commentId) ? 1 : priority[item.priority] + 2;
  const deadline = (item: InboxItem) => {const date = Date.parse((item.content.envelope ?? header(item.content.body).values)['ACK-BY'] ?? ''); return Number.isFinite(date) ? date : Infinity;};
  const position = (item: InboxItem) => item.delivery?.ordinal ?? item.commentId;
  const comparePosition = (a:InboxItem,b:InboxItem) => {const left=position(a),right=position(b);return left&&right?(BigInt(left)<BigInt(right)?-1:BigInt(left)>BigInt(right)?1:0):left?-1:right?1:0;};
  return [...items].sort((a,b) => group(a)-group(b) || (deadline(a) === deadline(b) ? 0 : deadline(a)<deadline(b) ? -1 : 1) || comparePosition(a,b) || a.viewKey.localeCompare(b.viewKey));
}

/** Refresh keeps P7 delivery E ordering while replacing the canonical snapshot membership. */
export function mergeInboxSnapshot(previous: readonly InboxItem[], fresh: readonly InboxItem[]): InboxItem[] {
  const model = new InboxModel();
  for (const item of previous) model.upsert(item);
  for (const item of fresh) model.upsert(item);
  return [...new Set(fresh.map(item => item.viewKey))].map(key => model.items.get(key)!);
}

/** A scope change is explicit; only positive finite issue numbers enter subscriptions. */
export function issueNumbers(raw: string): number[] {return [...new Set(raw.split(',').filter(Boolean).map(Number).filter(value => Number.isSafeInteger(value) && value > 0))];}
