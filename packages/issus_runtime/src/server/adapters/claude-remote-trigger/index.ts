import type {WakeAdapter,WakeInput,WakeResult} from 'issus_domain/common';
export interface ClaudeRemoteTrigger {trigger(input:WakeInput,signal:AbortSignal):Promise<WakeResult>}
/** Product-specific connection is injected and remains unverified; absent means disabled. */
export function createClaudeRemoteTriggerAdapter(client?:ClaudeRemoteTrigger):WakeAdapter {
 return {kind:'claude-remote-trigger',async wake(input,signal){if(!client) return {accepted:false};return client.trigger(input,AbortSignal.any([signal,AbortSignal.timeout(5000)]));}};
}
