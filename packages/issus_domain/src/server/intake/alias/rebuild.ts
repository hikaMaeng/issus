import {parseFactPayload,type AliasRegistered,type AliasRenamed} from '../../../common/index.js';
import {CoreError,type EventTransaction} from '../../backend/index.js';

export type AliasProfileFact={action:'issus.alias.registered';payload:AliasRegistered}|{action:'issus.alias.renamed';payload:AliasRenamed};

/** Restore ROSTER profile columns from canonical alias facts in caller-supplied replay order. */
export async function rebuildAliasProfiles(tx:EventTransaction,ownerId:string,facts:readonly AliasProfileFact[]):Promise<void> {
  for(const fact of facts) {
    if(!['issus.alias.registered','issus.alias.renamed'].includes(fact.action)||fact.payload.ownerId!==ownerId||!parseFactPayload(fact.action,fact.payload).ok) throw new CoreError(422,'INVALID_ALIAS_FACT');
    const p=fact.payload;
    const restored=await tx.client.query(`UPDATE ${tx.table('alias')} SET role=$3,model=$4,scope=$5 WHERE owner_id=$1 AND id=$2 RETURNING id`,[ownerId,p.aliasId,p.role,p.model,p.scope]);
    if(!restored.rowCount) throw new CoreError(409,'ALIAS_REBUILD_IDENTITY_REQUIRED');
    if(fact.action==='issus.alias.renamed') await tx.client.query(`UPDATE ${tx.table('alias')} SET role=$4,model=$5,scope=$6 WHERE owner_id=$1 AND renamed_to=$2 AND name=$3`,[ownerId,p.aliasId,fact.payload.oldName,p.role,p.model,p.scope]);
  }
}
