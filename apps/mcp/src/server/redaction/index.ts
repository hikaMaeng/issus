import {mask} from 'issus_domain/common';

/** Mask values before any wire, diagnostic or persistent output. Never serialize credentials. */
export class Redactor {
  private readonly secrets=new Set<string>();
  constructor(token?:string) {if(token)this.secrets.add(token);}
  add(value:string):void {if(value)this.secrets.add(value);}
  text(value:string):string {
    let result=value.replace(/issus\.bearer\.[A-Za-z0-9._~+/=-]+/gu,'[REDACTED]');
    for(const token of this.secrets) result=result.split(token).join('[REDACTED]');
    return mask(result).text;
  }
  value<T>(value:T):T {
    if(typeof value==='string')return this.text(value) as T;
    if(Array.isArray(value))return value.map(v=>this.value(v)) as T;
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,this.value(v)])) as T;
    return value;
  }
}
