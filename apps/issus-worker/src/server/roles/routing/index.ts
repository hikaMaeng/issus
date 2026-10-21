import {reactionCoordinates,type WorkerBindings,type RoleExecute} from 'issus_runtime/server';
/** Durable source projection rather than the reaction command identity. */
export const routingRole=(b:WorkerBindings):RoleExecute=>async event=>b.routing.react(reactionCoordinates(event));
