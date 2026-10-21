import type {Pool} from 'pg';
import {QUEUES} from 'issus_domain/common';

export interface HealthOptions {pool:Pool;schema?:string;migrationIds?:readonly string[];queueName?:(name:string)=>string;initialized?:()=>boolean}
/** Readiness checks DB, installed pgmq, required queues, applied migrations and caller initialization. */
export function createHealth(options:HealthOptions) {
  const schema=options.schema??'issus';if(!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('invalid schema');
  return {live:()=>({ok:true,service:'issus'}),ready:async():Promise<{ok:boolean;checks:Record<string,boolean>} >=>{
    const checks:Record<string,boolean>={db:false,pgmq:false,migrations:false,queues:false,initialized:options.initialized?.()??true};
    try {
      await options.pool.query('SELECT 1');checks.db=true;
      checks.pgmq=!!(await options.pool.query("SELECT 1 FROM pg_extension WHERE extname='pgmq'")).rowCount;
      const rows=(await options.pool.query(`SELECT id FROM "${schema}".schema_migration`)).rows.map(r=>r.id);
      checks.migrations=(options.migrationIds??['0001-domain-baseline','0002-runtime-auth','0003-canonical-history']).every(id=>rows.includes(id));
      const names=(await options.pool.query('SELECT queue_name FROM pgmq.list_queues()')).rows.map(r=>r.queue_name);
      checks.queues=Object.values(QUEUES).every(q=>names.includes(options.queueName?.(q)??q));
    }catch{/* readiness only exposes named checks */}
    return {ok:Object.values(checks).every(Boolean),checks};
  }};
}
