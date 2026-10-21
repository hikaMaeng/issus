import {QUEUES} from 'issus_domain/common';
/** Shared command queues are ensured before the first HTTP admission. */
export const ingressQueues=Object.values(QUEUES);
export const ingressQueueFor=(action:string):string=>action==='issus.clock.tick'?QUEUES.schedule:action.startsWith('issus.delivery.')||action==='issus.inbox.process'?QUEUES.delivery:QUEUES.intake;
