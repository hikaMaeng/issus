import {reactionCoordinates,type WorkerBindings,type RoleExecute} from 'issus_runtime/server';
/** P6 attaches its transaction callback through BindingOptions.compactReaction. */
export const compactRole=(b:WorkerBindings):RoleExecute=>async event=>b.compact(reactionCoordinates(event));
