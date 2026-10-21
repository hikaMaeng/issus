import type {CommandContext,DomainEvent,OwnerPayload} from '../envelope/index.js';
import type * as Repo from '../repo/index.js';
import type * as Issue from '../issue/index.js';
import type * as Comment from '../comment/index.js';
import type * as Alias from '../alias/index.js';
import type * as Session from '../session/index.js';
import type * as Delivery from '../delivery/index.js';
import type * as Compact from '../compact/index.js';
import type * as Board from '../board/index.js';
import type * as Handoff from '../handoff/index.js';
import type * as Inbox from '../inbox/index.js';
import type * as Subscription from '../subscription/index.js';

export const QUEUES={intake:'issus_intake',route:'issus_route',delivery:'issus_delivery',compact:'issus_compact',schedule:'issus_schedule'} as const;
export const REACTIONS_NAME='issus-v1';
export type QueueName=typeof QUEUES[keyof typeof QUEUES];
export interface ClockTick {slot:string}
export const CLOCK_ACTIONS={tick:'issus.clock.tick'} as const;
export interface CommandPayloadMap {
 'issus.repo.create':Repo.RepoCreateCommand;
 'issus.issue.open':Issue.IssueOpenCommand;
 'issus.issue.body.edit':Issue.IssueBodyEditCommand;
 'issus.issue.close':Issue.IssueCloseCommand;
 'issus.issue.reopen':Issue.IssueReopenCommand;
 'issus.comment.post':Comment.CommentPostCommand;
 'issus.alias.register':Alias.AliasRegisterRequest;
 'issus.alias.rename':Alias.AliasRenameRequest;
 'issus.board.ensure':Board.BoardEnsureCommand;
 'issus.handoff.accept':Handoff.HandoffAcceptCommand;
 'issus.handoff.complete':Handoff.HandoffCompleteCommand;
 'issus.delivery.receive':Delivery.DeliveryReceiveCommand;
 'issus.delivery.apply':Delivery.DeliveryApplyCommand;
 'issus.inbox.process':Inbox.InboxProcessCommand;
 'issus.clock.tick':ClockTick;
}
export interface FactPayloadMap {
 'issus.repo.created':Repo.RepoCreated;
 'issus.issue.opened':Issue.IssueOpened;
 'issus.issue.body.edited':Issue.IssueBodyEdited;
 'issus.comment.posted':Comment.CommentPosted;
 'issus.comment.rejected':Comment.CommentRejected;
 'issus.delivery.queued':Delivery.DeliveryQueued;
 'issus.delivery.delivered':Delivery.DeliveryDelivered;
 'issus.delivery.acked':Delivery.DeliveryAcked;
 'issus.delivery.applied':Delivery.DeliveryApplied;
 'issus.delivery.overdue':Delivery.DeliveryOverdue;
 'issus.delivery.redelivered':Delivery.DeliveryRedelivered;
 'issus.delivery.escalated':Delivery.DeliveryEscalated;
 'issus.delivery.superseded':Delivery.DeliverySuperseded;
 'issus.compact.due':Compact.CompactDue;
 'issus.compact.posted':Compact.CompactPosted;
 'issus.issue.closed':Issue.IssueClosed;
 'issus.issue.reopened':Issue.IssueReopened;
 'issus.handoff.accepted':Handoff.HandoffAccepted;
 'issus.issue.handed-off':Handoff.IssueHandedOff;
 'issus.alias.registered':Alias.AliasRegistered;
 'issus.alias.renamed':Alias.AliasRenamed;
 'issus.board.created':Board.BoardCreated;
 'issus.subscription.opened':Subscription.SubscriptionOpened;
 'issus.subscription.closed':Subscription.SubscriptionClosed;
 'issus.session.opened':Session.SessionOpened;
 'issus.session.revoked':Session.SessionRevoked;
 'issus.inbox.processed':Inbox.InboxProcessed;
 'issus.application.rejected':Delivery.ApplicationRejected;
}
export type CommandAction=keyof CommandPayloadMap;
export type FactAction=keyof FactPayloadMap;
export type DomainAction=CommandAction|FactAction;
export type DomainCommand<A extends CommandAction=CommandAction>={ [K in A]:{action:K;payload:CommandWirePayload<K>}}[A];
export type DomainFact<A extends FactAction=FactAction>={ [K in A]:Omit<DomainEvent<K,FactPayloadMap[K]>,'kind'> & {kind:K extends 'issus.comment.rejected'|'issus.application.rejected' ? 'failure' : 'fact'}}[A];
/** Top-level broker provenance belongs to the consumed fact, not to the unchanged domain payload. */
export type ReactionInput<A extends FactAction=FactAction>=DomainFact<A> & {sourceEventId:string;sourceStreamId:string;sourceSequence:string};
/** Shape only. The single concrete reaction table is owned by apps/issus, per design §4.3. */
export interface DomainReaction {action:FactAction;queue:QueueName;handler:string}
export interface DomainReactionTable {reactionsName:typeof REACTIONS_NAME;reactions:readonly DomainReaction[]}
export type CommandWirePayload<A extends CommandAction> = CommandPayloadMap[A] & OwnerPayload & (A extends 'issus.clock.tick' ? object : CommandContext);
export const COMMAND_ACTIONS=['issus.repo.create','issus.issue.open','issus.issue.body.edit','issus.issue.close','issus.issue.reopen','issus.comment.post','issus.alias.register','issus.alias.rename','issus.board.ensure','issus.handoff.accept','issus.handoff.complete','issus.delivery.receive','issus.delivery.apply','issus.inbox.process','issus.clock.tick'] as const satisfies readonly CommandAction[];
export const FACT_ACTIONS=['issus.repo.created','issus.issue.opened','issus.issue.body.edited','issus.comment.posted','issus.comment.rejected','issus.delivery.queued','issus.delivery.delivered','issus.delivery.acked','issus.delivery.applied','issus.delivery.overdue','issus.delivery.redelivered','issus.delivery.escalated','issus.delivery.superseded','issus.compact.due','issus.compact.posted','issus.issue.closed','issus.issue.reopened','issus.handoff.accepted','issus.issue.handed-off','issus.alias.registered','issus.alias.renamed','issus.board.created','issus.subscription.opened','issus.subscription.closed','issus.session.opened','issus.session.revoked','issus.inbox.processed','issus.application.rejected'] as const satisfies readonly FactAction[];
export {parseCommandPayload,parseDomainClientFrame,parseDomainServerFrame} from './parser.js';
export {parseFactPayload,parseReactionInput} from './fact-parser.js';
