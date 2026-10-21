import {QUEUES,REACTIONS_NAME} from 'issus_domain/common';
import type {ReactionTable} from 'agent/broker';
/** design §4.3: the sole concrete reaction table; result/failure envelopes never recurse. */
export const reactions:ReactionTable={
 'issus.issue.opened':[QUEUES.route],
 'issus.issue.body.edited':[QUEUES.route],
 'issus.comment.posted':[QUEUES.route,QUEUES.compact,QUEUES.delivery],
 'issus.delivery.queued':[QUEUES.schedule],
 'issus.delivery.acked':[QUEUES.schedule],
 'issus.delivery.overdue':[QUEUES.delivery],
 'issus.delivery.escalated':[QUEUES.route],
 'issus.delivery.superseded':[QUEUES.schedule],
 'issus.compact.due':[QUEUES.route],
 'issus.compact.posted':[QUEUES.route,QUEUES.compact],
 'issus.issue.closed':[QUEUES.route],
 'issus.issue.reopened':[QUEUES.route],
 'issus.handoff.accepted':[QUEUES.route],
 'issus.issue.handed-off':[QUEUES.route],
 'issus.board.created':[QUEUES.route]
};
export const reactionsName=REACTIONS_NAME;
