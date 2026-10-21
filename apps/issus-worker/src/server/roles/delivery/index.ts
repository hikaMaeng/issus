import {reactionCoordinates,type WorkerBindings,type RoleExecute} from 'issus_runtime/server';
/** Client delivery commands and source-fact reactions share a queue, never a decoder. */
export const deliveryRole=(b:WorkerBindings):RoleExecute=>async(event,_signal,_emit,context)=>{
 if(event.action==='issus.comment.posted') return b.references.react(reactionCoordinates(event));
 if(event.action==='issus.delivery.overdue') return b.retry.react(reactionCoordinates(event));
 return b.deliveries.executeIngress(event,async()=>{if(!await context.fence()) throw new Error('execution lease lost');});
};
