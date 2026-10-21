import type {Id,RepoPayload} from '../envelope/index.js';
export const BOARD_ACTIONS={ensure:'issus.board.ensure',created:'issus.board.created'} as const;
export const BOARD_TYPES=['NOTE','ACK','ALIAS','COMPACT'] as const;
export const BOARD_NOTE_MAX_CHARS=1500;
export interface BoardEnsureCommand {repoId:Id;boardOwner:string;body?:string}
export interface BoardCreated extends RepoPayload {issueNumber:number;ownerAliasId:Id;title:string;body:string}
export interface BoardResponse {number:number;state:string;via:'explicit'|'body'|'registry'|'pinned-title'|'label'|'title-search';evidence:string[]}
