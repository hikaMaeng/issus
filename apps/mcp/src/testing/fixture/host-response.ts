import type {CommentView} from 'issus_domain/common';

/** ASK6361874801 host author shape; owner is rebound to the isolated fixture. */
export function systemComment(base:CommentView):CommentView {
  const body='FROM:issus-4-muse/by-bridge-system TO:ALL TYPE:ALIAS\n시스템 등록';
  return {...base,body,envelope:{FROM:'issus-4-muse/by-bridge-system',TO:'ALL',TYPE:'ALIAS'},charCount:Array.from(body).length,
    author:{ownerId:base.author.ownerId,aliasId:'359da00a-19f7-471e-a50c-976eb092f719',alias:'issus-4-muse',sid:'by-bridge-system',sessionId:'6b3017cd-5d7b-4ab1-bb5f-0c16b33d7363'},
    postedByAliasId:'b0a9dd95-bdde-4c45-ae59-1db9c098220a',validity:'v2',metadata:{}};
}
