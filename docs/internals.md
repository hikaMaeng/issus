# 내부 계약

EventUnitOfWork가 projection·불변 comment·immediate directive index·command_result·event_store·PGMQ reaction send를 같은 tx에 넣는다. comment UPDATE/DELETE는 거부한다. before-close due는 close보다 앞선 별도 제어 tx로 보존해 실패한 close에도 남는다.

정본 fact의 sourceEventId/sourceStreamId/sourceSequence를 reaction work에 보존한다. 큐별 reaction id와 원 fact id는 다르며 projection의 원 source 기준 중복 제거를 유지한다. broker log tail이 alias channel을 WS/SSE에 전달하고 느린 연결은1013으로 닫아 재생한다. 외부 WS command는 금지다.

| 상태·cursor | 의미 |
| --- | --- |
| posted→delivered→acked→applied | 저장·transport 수신·직접 TO ACK·근거 반영; 지연 receipt로 후퇴하지 않음 |
| pendingLegacy window/global | 정본 RE/SUPERSEDES 호환 계산, 재전달 입력 |
| ackState | 실제 TO 직접 ACK/반영 강화 상태, legacy pending과 독립 |
| transport cursor | principal+channel에 묶인 불변 재생 snapshot |
| pagination cursor | 고정 bootstrap snapshot 안의 다음 page |
| refreshCursor H/A/E | canonical comment·inbox ordinal·alias event sequence; 새 댓글 없는 상태/attempt 변경도 회수 |
| processedCursor | 근거로 닫힌 연속 prefix, 화면 표시·peek로 전진하지 않음 |

HOLD는 ACK만으로 해제되지 않고 권한 있는 DECISION SUPERSEDES가 필요하다. 첫 HOLD 재전달은 에스컬레이션한다. REPORT RE가 호환 pending을 해소해도 강화 ACK가 없으면 close/apply는 차단할 수 있다. COMPACT는 과거 의무를 지우지 않는다.

프런트는 P7 IssusClient.write로202 operation을 poll하고 InboxModel로 viewKey와 E/attempt 순서를 처리한다. history의 모든 page를 읽고 단건 comment API로 createdAt/validity/전문을 보강한다. SSE는 영수만 자동 작성하고 ACK는 미리보기 후 명시 게시한다.5초 pull이 상태를 다시 조회한다.

COMPACT packet은 hash·opaque token·revision·through id·previous pointer·표본3건(구간3건 미만은 전부)·compactedBy를 결합한다. stale409, raw token은 fact/command result에 보관하지 않는다. [COMPACT 세부](../packages/issus_domain/docs/compact.md)를 따른다.

운영 경보는 queue age/depth, reaction lag, pendingLegacy와 ackState 별도 지표, attempts/escalations, compactDue, DB wait, scheduler lastTick이다. shutdown은 ready503→producer/read 중단→진행 tx 완료→WS1001/SSE 종료→pool 종료다. SIGKILL·backup restore·장기 영속성은 [시험](testing.md)의 별도 수용이다.
