/** Migration runners live in issus_runtime (P4). This module describes the immutable baseline only. */
export interface Migration {readonly id:string;readonly filename:string;readonly schema:'issus'}
export interface MigrationTransaction {query(sql:string,parameters?:readonly unknown[]):Promise<unknown>}
export interface MigrationApplier {apply(migration:Migration,sql:string,transaction:MigrationTransaction):Promise<void>}
export const BASELINE_MIGRATION:Migration={id:'0001-domain',filename:'0001-domain-baseline.sql',schema:'issus'};
