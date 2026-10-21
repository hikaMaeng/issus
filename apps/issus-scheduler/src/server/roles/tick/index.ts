import {reactionCoordinates,type WorkerBindings,type RoleExecute} from 'issus_runtime/server';
/** The producer's slot is only a wakeup; due selection uses the domain Clock. */
export const tickRole=(b:WorkerBindings):RoleExecute=>async event=>event.action==='issus.clock.tick'?b.tick.tick(String(event.payload.slot)):b.deadline.react(reactionCoordinates(event));
