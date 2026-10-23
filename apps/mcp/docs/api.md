# API

정확한 schema: `src/server/tools/schema.ts`와 MCP `tools/list`. 각 object는 명시한 키만 받는다.

| 도구 | 입력 핵심 | 효과 |
| --- | --- | --- |
| issus_subscribe | alias, sid? | token principal 검사·최초 전체 snapshot, 멱등 |
| issus_wait | timeoutMs? 1~1500000, 기본60000 | 다음 delivery 한 건 또는 정상 빈 timeout |
| issus_inbox | sinceCompact?, limit? 1~500, cursor? | 원 protocol 전체 preview; 큐/processed 변경 없음 |
| issus_show | commentId, repo? | 불변 원문, validity·redacted 표시 |
| issus_post | repo, issue, body, editBody?, dryRun?, COMPACT metadata? | 정본 검사·preflight·게시 또는 If-Match 편집 |
| issus_ack | deliveryId 또는 commentId 정확히1개, body | 완전한 ACK 게시, 실제 ackState 확인 |
| issus_handoff_accept | repo, issue, handoffId, ackCommentId | source HANDOFF의 명시적 수용; complete는 원 OWNER 몫 |
| issus_process | deliveryIds, disposition, evidenceCommentId?, reason? | 서버 processing 기록; ignored reason 필수 |
| issus_apply | deliveryId, evidenceCommentId, outcome, reason? | REPORT 증거 application; not-applied reason 필수 |
| issus_status | 빈 object | 연결·큐·cursor·HOLD 진단; credentials 없음 |

응답은 `content[0].text`와 동일한 `structuredContent`다.

```text
{ok:true,data:...}
{ok:false,error:{code,httpStatus,reasons,retryable,posted:false|null,operationId?}}
```

오류는 `isError:true`. 422 사유의 한국어 원문/순서·409 ACK_REQUIRED·412 revision 충돌을 보존한다. 미확정 write는 `posted:null`, 알려진 operationId와 같은 key를 보존한다. API202를 posted로 반환하지 않는다.

`DeliveryPacket`에는 id/source 좌표·원문·분류·실제 TO의 ackRequired·이슈 본문/revision·최신 COMPACT·pendingLegacy·ackState·activeHolds·REPLY-IN·receipt·recovery가 있다. 10진 ID/sequence는 문자열이며 Number로 변환하지 않는다.

댓글 `author.alias/sid`는 서버의 불변 원 FROM에서 읽은 문자열이다. 대리 작성 `by-bridge-system`·NOENV의 빈 문자열도 수용하며, subscribe/post 입력의 alias/sid 검증은 그대로 적용한다. inbox의 `commentId:null`은 부재로 정규화하고 비댓글 fact는 조회 없이 `commentId:null` 패킷으로 반환한다.

영구 댓글 조회 실패를 건너뛴 경우 `issus_status.data.lastError`는 `{code,httpStatus,commentId,viewKey}`다. 성공한 wait/status 호출과 재시작 뒤에도 journal의 마지막 진단을 유지한다. 해당 항목의 ACK/application/process는 수행하지 않는다.

ACK는 NOTE·CLAIM·제3자 원문에도 게시할 수 있다. `acked:false`는 이 게시를 거부한다는 뜻이 아니다. mention-only는 원 이슈의 ACK/답변 RE로 pendingLegacy를 해소하고 inbox로 재확인한다. 직접 TO ACK·HOLD 해제 권한은 얻지 않는다.
