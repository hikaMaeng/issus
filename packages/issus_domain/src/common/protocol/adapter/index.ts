/** Optional external wakeup is not a receipt or a user ACK. */
export interface WakeInput {deliveryId:string;alias:string;sid?:string;sourceCommentId?:string;attempt:number;idempotencyKey:string}
export interface WakeResult {accepted:boolean;externalReceipt?:string}
export interface WakeAdapter {kind:'webhook'|'command'|'claude-remote-trigger';wake(input:WakeInput,signal:AbortSignal):Promise<WakeResult>}
export interface DisabledWakeAdapter {kind:'disabled';wake(input:WakeInput,signal:AbortSignal):Promise<WakeResult>}
