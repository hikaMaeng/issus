import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {QUEUES} from 'issus_domain/common';

export interface SqlMigration {id:string;sql:string}
export interface MigrationOptions {pool:Pool;schema?:string;baselineSql?:string;migrations?:readonly SqlMigration[];directory?:string;queueName?:(queue:string)=>string;ensureBroker?:()=>Promise<void>}
const ident=(v:string):string=>{if(!/^[a-z_][a-z0-9_]*$/.test(v)) throw new Error('invalid schema');return `"${v}"`;};
const AUTH_SQL=`CREATE TABLE issus.bootstrap_auth (id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES issus.owner(id),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'));
CREATE TABLE issus.browser_session (id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES issus.session(id),token_hash text NOT NULL UNIQUE,csrf_hash text NOT NULL,expires_at timestamptz NOT NULL,origin text NOT NULL);`;
/** Baseline plus sorted numbered files; checksums prevent editing an already applied migration. */
export async function runMigrations(options:MigrationOptions):Promise<{applied:string[]}> {
  const schema=options.schema??'issus',q=ident(schema);
  let migrations:SqlMigration[];
  if(options.migrations) migrations=[...options.migrations];
  else {
    const baseline=options.baselineSql??await readFile(new URL('./backend/schema/0001-domain-baseline.sql',import.meta.resolve('issus_domain/server')),'utf8');
    migrations=[{id:'0001-domain-baseline',sql:baseline},runtimeAuthMigration,runtimeHistoryMigration];
  }
  if(options.directory) for(const filename of (await readdir(options.directory)).filter(f=>/^\d{4}-.+\.sql$/.test(f)).sort()) migrations.push({id:filename.slice(0,-4),sql:await readFile(join(options.directory,filename),'utf8')});
  migrations.sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(migrations.map(m=>m.id.slice(0,4))).size!==migrations.length||migrations.some((m,i)=>Number(m.id.slice(0,4))!==i+1)) throw new Error('migration sequence must be contiguous from 0001');
  const client=await options.pool.connect();const applied:string[]=[];
  try {
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`issus-schema:${schema}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${q}`);await client.query(`CREATE TABLE IF NOT EXISTS ${q}.schema_migration(id text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    for(const migration of migrations) {
      const hash=createHash('sha256').update(migration.sql).digest('hex');const old=(await client.query(`SELECT sha256 FROM ${q}.schema_migration WHERE id=$1`,[migration.id])).rows[0];
      if(old) {if(old.sha256!==hash) throw new Error(`migration checksum mismatch: ${migration.id}`);continue;}
      await client.query(migration.sql.replace(/\bissus\b/g,q));await client.query(`INSERT INTO ${q}.schema_migration(id,sha256) VALUES($1,$2)`,[migration.id,hash]);applied.push(migration.id);
    }
    await client.query('CREATE EXTENSION IF NOT EXISTS pgmq');
    for(const queue of Object.values(QUEUES)) await client.query('SELECT pgmq.create($1)',[options.queueName?.(queue)??queue]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  await options.ensureBroker?.();return {applied};
}
/** SQL for isolated harnesses that supply the baseline themselves. */
export const runtimeAuthMigration:SqlMigration={id:'0002-runtime-auth',sql:AUTH_SQL};
export const runtimeHistoryMigration:SqlMigration={id:'0003-canonical-history',sql:`CREATE TABLE issus.history_snapshot(id uuid PRIMARY KEY,principal_id uuid NOT NULL,scope_hash text NOT NULL,snapshot jsonb NOT NULL,expires_at timestamptz NOT NULL); CREATE INDEX history_snapshot_expiry ON issus.history_snapshot(expires_at);`};
/** Explicit connection URL; optional namespace is for isolated integration harnesses only. */
export function createRuntimePool(databaseUrl:string,brokerSchema='public'):Pool {
  ident(brokerSchema);const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${brokerSchema},public`});
  // pg-pool removes its idle listener on checkout. UoW captures the cause and owns release/retry;
  // other runtime borrowers must also survive an asynchronous FATAL between queries.
  pool.on('connect',client=>{client.on('error',()=>{});});
  pool.on('error',()=>{});return pool;
}
