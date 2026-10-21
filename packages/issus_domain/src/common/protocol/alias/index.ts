import type {Actor,Id,IssueRef,OwnerPayload,RepoPayload} from '../envelope/index.js';
export const ALIAS_ACTIONS={register:'issus.alias.register',registered:'issus.alias.registered',rename:'issus.alias.rename',renamed:'issus.alias.renamed'} as const;
export interface AliasRegisterRequest {owner:string;name:string;role:string;model:string;scope:string;repos:Id[];announcementIssue?:IssueRef;announcementBody:string}
export interface AliasRenameRequest {aliasId:Id;newName:string;announcementIssue?:IssueRef;announcementBody:string}
export interface AliasRegistered extends RepoPayload {aliasId:Id;name:string;oldName?:string;repos:Id[];role:string;model:string;scope:string;actor:Actor}
export type AliasRenamed=AliasRegistered & {oldName:string};
export interface AliasView extends OwnerPayload {id:Id;name:string;foldedName:string;status:'active'|'renamed';renamedTo?:Id;registeredAt:string}
export interface AliasCheckResponse {available:boolean;collisions:{kind:'exact'|'case'|'substring'|'edit-distance-1';alias:string;evidence:readonly string[]}[]}
