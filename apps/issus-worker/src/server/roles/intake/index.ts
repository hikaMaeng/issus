import type {WorkerBindings,RoleExecute} from 'issus_runtime/server';
/** P4 command intake, including final session/context checks. */
export const intakeRole=(b:WorkerBindings):RoleExecute=>async(event,_signal,_emit,context)=>b.intake.executeIngress(event,async()=>{if(!await context.fence()) throw new Error('execution lease lost');});
