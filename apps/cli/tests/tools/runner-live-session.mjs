import {emitted} from './runner-fixtures.mjs';

/** Bind the issued session to auth/me before constructing the real runner. No response bodies in errors. */
export async function createLiveRunner({client,sessions,alias,options,dependencies={}}) {
 const session=sessions.find(x=>x?.alias===alias);
 if(!session) throw new Error('LIVE_SESSION_NOT_FOUND');
 if(typeof session.token!=='string'||!session.token||typeof session.sessionId!=='string'||!session.sessionId||typeof session.sid!=='string'||!session.sid) throw new Error('LIVE_SESSION_RESPONSE_INVALID');
 const {data}=await client.request('/v1/auth/me');
 const principal=data&&typeof data==='object'&&'principal' in data?data.principal:data;
 if(!principal||principal.kind!=='session'||['id','ownerId','aliasId','sessionId','alias','sid'].some(k=>typeof principal[k]!=='string'||!principal[k])) throw new Error('LIVE_AUTH_PRINCIPAL_INVALID');
 if(principal.alias!==alias||principal.sid!==session.sid||principal.sessionId!==session.sessionId||principal.id!==session.sessionId) throw new Error('LIVE_AUTH_SESSION_MISMATCH');
 const {HostRunner}=await import(emitted('index.js'));
 return new HostRunner({...dependencies,client,principal,options,token:session.token});
}
