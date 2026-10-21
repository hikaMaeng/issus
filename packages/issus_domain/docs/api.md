# API

고정 action은 아래 15 command·28 fact/failure다. payload 타입은 `common/protocol/<family>/index.ts`, action-indexed map은 `common/protocol/runtime/index.ts`에 있다. bigint/comment/sequence/ordinal은 모두 문자열이다.

| action | payload 타입 |
| --- | --- |
| `issus.repo.create` | `Repo.RepoCreateCommand` |
| `issus.issue.open` | `Issue.IssueOpenCommand` |
| `issus.issue.body.edit` | `Issue.IssueBodyEditCommand` |
| `issus.issue.close` | `Issue.IssueCloseCommand` |
| `issus.issue.reopen` | `Issue.IssueReopenCommand` |
| `issus.comment.post` | `Comment.CommentPostCommand` |
| `issus.alias.register` | `Alias.AliasRegisterRequest` |
| `issus.alias.rename` | `Alias.AliasRenameRequest` |
| `issus.board.ensure` | `Board.BoardEnsureCommand` |
| `issus.handoff.accept` | `Handoff.HandoffAcceptCommand` |
| `issus.handoff.complete` | `Handoff.HandoffCompleteCommand` |
| `issus.delivery.receive` | `Delivery.DeliveryReceiveCommand` |
| `issus.delivery.apply` | `Delivery.DeliveryApplyCommand` |
| `issus.inbox.process` | `Inbox.InboxProcessCommand` |
| `issus.clock.tick` | `ClockTick` |
| `issus.repo.created` | `Repo.RepoCreated` |
| `issus.issue.opened` | `Issue.IssueOpened` |
| `issus.issue.body.edited` | `Issue.IssueBodyEdited` |
| `issus.comment.posted` | `Comment.CommentPosted` |
| `issus.comment.rejected` | `Comment.CommentRejected` |
| `issus.delivery.queued` | `Delivery.DeliveryQueued` |
| `issus.delivery.delivered` | `Delivery.DeliveryDelivered` |
| `issus.delivery.acked` | `Delivery.DeliveryAcked` |
| `issus.delivery.applied` | `Delivery.DeliveryApplied` |
| `issus.delivery.overdue` | `Delivery.DeliveryOverdue` |
| `issus.delivery.redelivered` | `Delivery.DeliveryRedelivered` |
| `issus.delivery.escalated` | `Delivery.DeliveryEscalated` |
| `issus.delivery.superseded` | `Delivery.DeliverySuperseded` |
| `issus.compact.due` | `Compact.CompactDue` |
| `issus.compact.posted` | `Compact.CompactPosted` |
| `issus.issue.closed` | `Issue.IssueClosed` |
| `issus.issue.reopened` | `Issue.IssueReopened` |
| `issus.handoff.accepted` | `Handoff.HandoffAccepted` |
| `issus.issue.handed-off` | `Handoff.IssueHandedOff` |
| `issus.alias.registered` | `Alias.AliasRegistered` |
| `issus.alias.renamed` | `Alias.AliasRenamed` |
| `issus.board.created` | `Board.BoardCreated` |
| `issus.subscription.opened` | `Subscription.SubscriptionOpened` |
| `issus.subscription.closed` | `Subscription.SubscriptionClosed` |
| `issus.session.opened` | `Session.SessionOpened` |
| `issus.session.revoked` | `Session.SessionRevoked` |
| `issus.inbox.processed` | `Inbox.InboxProcessed` |
| `issus.application.rejected` | `Delivery.ApplicationRejected` |

command business payload 뒤 서버가 `CommandContext {actor,idempotencyKey}`와 ownerId를 각인한다. `issus.clock.tick`는 scheduler 내부 명령이다. fact 공통 범위는 OwnerPayload/RepoPayload/IssuePayload를 따른다. `Actor`에는 secret이 없다. token을 가진 `SessionCreatedResponse`는 최초 HTTP 응답 전용이며 fact가 아니다.

| 공개 함수/타입 | 고정 의미 |
| --- | --- |
| `checkComment(body)`, `checkIssueBody(body)` | ordered string[]; 빈 배열=문법 통과 |
| `parseEnvelope(first, errs)` | 부분 봉투 반환, 정본 오류를 errs에 append |
| `parseIssueBodyEnvelope(body)` | 정본 body 검증 후 typed envelope와 사유 반환 |
| `aliasOk`, `isoOk`, `checkRecipient`, `checkAlias`, `aliasCollisions`, `dist1` | 문법·달력·owner-scoped 별칭 근접 충돌 |
| `parseCommentRequest(value)` | HTTP metadata 단일 schema/TYPE 조건/unknown key 거부 |
| `parseCommandPayload(action,value)`, `parseFactPayload(action,value)` | lossless shape decoder, unknown key 거부 |
| `parseDomainClientFrame`, `parseDomainServerFrame`, `parseReactionInput` | 구독·receipt 전용 프레임/원 source3개 필수 |
| `header`, `classify`, `mentioned`, `toMe`, `normalizeMe`, `ids` | 정본 watcher의 v2/레거시 best-effort·ME→CC→ALL→OTHER |
| `pendingLegacy(comments,me)` | 주어진 issue 구간의 정본 PENDING-ACK |
| `ackState(directive,comments)` | 실제 TO 직접 ACK/최초 ACK·applied/superseded projection |
| `transitionDelivery`, `DELIVERY_TRANSITIONS` | receipt/ACK/apply/retry의 단조 상태 전이 |
| `isCompact`, `sinceCompactStats`, `compactDue` | legacy 경계 탐지/전체 codepoint 통계/임계 |
| `mask`, `MASKS` | 전체 조립 패킷 1회 마스킹·최종 치환 수 |
| `aliasChannel`, `repoChannel`, `issueChannel`, `sessionChannel`, `supervisorChannel`, `internalChannel`, `canonicalStream` | design §4.1·§5.1 채널·stream 생성 |
| `InboxResponse`, `InboxBootstrap` | H/A/E 고정 snapshot·refresh/processed 커서 분리 |
| `DomainClientFrame`, `DomainServerFrame` | WS/SSE 공통 wire, client event mutation 없음 |
| `CompactPacket`, `CommentMetadata` | 해석된 snapshot 증거 보존; raw packetToken은 요청 전용 |
| `WakeAdapter` | 외부 깨우기 accepted는 receipt/ACK가 아님 |
| `QUEUES`, `REACTIONS_NAME`, `DomainReactionTable` | 큐 상수와 반응표 타입; 구체 반응표는 app 소유 |

기존 Python 이름 alias(`check_comment`, `check_issue_body`, `parse_envelope`, `iso_ok`, `alias_ok`, `check_recipient`, `to_me`, `is_compact`, `since_compact_stats`)도 제공한다. 서버/프런트는 이 공개 경계의 wire 타입을 재사용한다. 인터페이스 타입만으로 권한·snapshot 일관성을 추정하지 않는다.
