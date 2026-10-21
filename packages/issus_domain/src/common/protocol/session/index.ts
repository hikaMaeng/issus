import type {Id,IsoTime,OwnerPayload} from '../envelope/index.js';
export const SESSION_ACTIONS={opened:'issus.session.opened',revoked:'issus.session.revoked'} as const;
export interface SessionCreateRequest {alias:string;sid:string;resumeFrom?:string;reissueOf?:Id}
/** Token appears only on the initial 201 response; it is absent from all fact types. */
export interface SessionCreatedResponse {sessionId:Id;token:string;expiresAt:IsoTime;alias:string;sid:string}
export interface SessionNotReplayable {sessionId:Id;alias:string;sid:string;expiresAt:IsoTime;reissueRequired:true}
export interface SessionOpened extends OwnerPayload {sessionId:Id;aliasId:Id;sid:string;expiresAt?:IsoTime;reason?:string}
export type SessionRevoked=SessionOpened;
export interface SessionPrincipal {kind:'session';id:Id;ownerId:Id;aliasId:Id;alias:string;sid:string;sessionId:Id;capabilities:readonly string[]}
export interface BootstrapPrincipal {kind:'bootstrap';id:Id;ownerId:Id;capabilities:readonly string[]}
export type Principal=SessionPrincipal|BootstrapPrincipal;
