import type {WakeAdapter} from 'issus_domain/common';
export interface WebhookConfig {endpoints:Readonly<Record<string,string>>;allowedOrigins:readonly string[];headers?:Readonly<Record<string,string>>;fetch?:typeof fetch}
/** Only administrator-mapped endpoints; comment text never supplies a URL. External 2xx is not ACK. */
export function createWebhookAdapter(config:WebhookConfig):WakeAdapter {
 for(const value of Object.values(config.endpoints)) {const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!config.allowedOrigins.includes(url.origin)) throw new Error('webhook endpoint not allowed');}
 return {kind:'webhook',async wake(input,signal){
  const url=config.endpoints[input.alias];if(!url) return {accepted:false};
  const result=await (config.fetch??fetch)(url,{method:'POST',redirect:'error',headers:{...config.headers,'content-type':'application/json','idempotency-key':input.idempotencyKey},body:JSON.stringify(input),signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
  await result.body?.cancel();return {accepted:result.ok};
 }};
}
