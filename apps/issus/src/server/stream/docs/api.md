# api

createDeliveryProjection(uow)(event, principal)는 EventEnvelope를 반환한다. payload.issue={repoId,issueNumber}, commentId, envelope, priority, content, delivery={id,state,attempt,ordinal,ackRequired,ackBy?,aliasEventSequence}. 원댓글 없는 제어 알림의 commentId/envelope는 null이다.
