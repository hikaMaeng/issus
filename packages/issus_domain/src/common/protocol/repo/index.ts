import type {Actor,Id,OwnerPayload,RepoPayload} from '../envelope/index.js';
export const REPO_ACTIONS={create:'issus.repo.create',created:'issus.repo.created'} as const;
export interface RepoCreateRequest {owner:string;slug:string;projectCode:string;autoBoard?:boolean;boardOwner?:string}
export type RepoCreateCommand=Omit<RepoCreateRequest,'autoBoard'> & {autoBoard:boolean};
export interface RepoCreated extends RepoPayload {slug:string;projectCode:string;autoBoard:boolean;actor:Actor;version:number}
export interface RepoView extends OwnerPayload {id:Id;slug:string;projectCode:string;nextIssueNumber:number;boardIssueId?:number;autoBoard:boolean}
