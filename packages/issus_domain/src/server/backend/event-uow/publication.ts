import type {CompactCommentMetadata} from '../../../common/index.js';
import type {EventTransaction} from './index.js';
import type {IssueRow,CommentRow} from '../repository/index.js';

/** P6 receives this exact DB transaction after context checks and immutable comment insertion. */
export interface CompactPublicationInput {issue:IssueRow;comment:CommentRow;packet:Record<string,unknown>;metadata:CompactCommentMetadata}
export type CompactPublication=(tx:EventTransaction,input:CompactPublicationInput)=>Promise<void>;
/** P4 owns canonical pointer/fact publication. Until P6 attaches its projection hook, this is inert. */
export const noCompactPublication:CompactPublication=async()=>{};
