import envSchema from 'env-schema';

export interface RuntimeConfig {DATABASE_URL:string;ISSUS_OWNER:string;ISSUS_BOOTSTRAP_TOKEN_FILE:string;ISSUS_ORIGIN:string;PORT:number;HOST:string;ISSUS_SESSION_TTL_SECONDS:number}
/** Environment is parsed before DB creation/listen. No account, database or secret defaults. */
export function parseRuntimeConfig(data:Record<string,unknown>=process.env):RuntimeConfig {
  return envSchema<RuntimeConfig>({data,env:false,schema:{type:'object',required:['DATABASE_URL','ISSUS_OWNER','ISSUS_BOOTSTRAP_TOKEN_FILE','ISSUS_ORIGIN','PORT'],properties:{DATABASE_URL:{type:'string',minLength:1,pattern:'^postgres(?:ql)?://'},ISSUS_OWNER:{type:'string',minLength:1},ISSUS_BOOTSTRAP_TOKEN_FILE:{type:'string',minLength:1},ISSUS_ORIGIN:{type:'string',minLength:1,pattern:'^https?://'},PORT:{type:'integer',minimum:10000,maximum:59999},HOST:{type:'string',default:'127.0.0.1'},ISSUS_SESSION_TTL_SECONDS:{type:'integer',minimum:60,maximum:604800,default:86400}}}});
}
