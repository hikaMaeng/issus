import type {InboxItem, InboxResponse} from '../../../common/protocol/inbox/index.js';
import {compareSequence, type ClientCursors} from '../cursor/index.js';

export interface DeliveryVersion {id:string; sequence:string; attempt:number; state:string}

/** A viewKey merges history with delivery updates; alias sequence orders equal-attempt state changes. */
export class InboxModel {
  readonly items = new Map<string,InboxItem>();
  readonly versions: Record<string,DeliveryVersion>;
  readonly cursors: ClientCursors;
  private snapshotId?: string;

  constructor(cursors: ClientCursors = {}, versions: Record<string,DeliveryVersion> = {}) {
    this.cursors={...cursors}; this.versions={...versions};
  }

  upsert(item: InboxItem): boolean {
    const old=this.items.get(item.viewKey), delivery=item.delivery;
    const previous=delivery?this.versions[delivery.id]:undefined;
    if (delivery && previous && compareSequence(delivery.aliasEventSequence,previous.sequence)<0) return false;
    if (delivery && previous && compareSequence(delivery.aliasEventSequence,previous.sequence)===0 && old?.delivery && delivery.attempt<old.delivery.attempt) return false;
    if (!delivery && old?.delivery) return false;
    this.items.set(item.viewKey,{...old,...item,content:item.origin==='inbox'&&old?.origin==='history'?old.content:item.content});
    if(delivery) this.versions[delivery.id]={id:delivery.id,sequence:delivery.aliasEventSequence,attempt:delivery.attempt,state:delivery.state};
    return true;
  }

  /** Caller commits these cursors only after every page has been consumed and output succeeds. */
  acceptPage(page: InboxResponse): void {
    if (this.snapshotId && this.snapshotId!==page.bootstrap.snapshotId) throw new Error('INBOX_SNAPSHOT_CHANGED');
    this.snapshotId=page.bootstrap.snapshotId;
    for(const item of page.items) this.upsert(item);
    this.cursors.paginationCursor=page.nextCursor;
    if(page.nextCursor===null) {
      if(!page.bootstrap.complete) throw new Error('INBOX_BOOTSTRAP_INCOMPLETE');
      this.cursors.refreshCursor=page.refreshCursor;
      this.cursors.processedCursor=page.processedCursor;
    }
  }
}
