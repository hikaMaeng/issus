# 라우팅·전달·구독 조회

공개 경계는 `issus_domain/server`의 `RoutingService`, `DeliveryCommandService`, `DeliveryReferenceService`, `InboxService`, `DeadlineService`, `RetryService`, `TickService`다. 앱이 P4 `EventUnitOfWork`를 주입한다. 새 schema 없이 baseline의 delivery/receipt/processed/schedule과 0003 history_snapshot을 쓴다.

## 수신자

TO/CC/본문 mention은 owner 레지스트리에서 계산한다. ALL·HOLD·DECISION은 repo 멤버, COMPACT는 OWNER, OTHER는 명시 issue 관찰 구독자에게 보낸다. 공통 `header/classify/mentioned`를 그대로 호출하고 ME→CC→ALL→OTHER 우선순위를 바꾸지 않는다. 자기 FROM과 noenv는 자동 delivery에서 제외한다. 직접 TO·mention은 오프라인·멤버십 누락으로 버리지 않는다.

`(sourceEventId,recipientAliasId)`가 영속 고유키다. alias inbox_clock을 같은 tx에서 올려 ordinal을 정한다. 반응의 원 source3을 DB 원 fact와 검증하고 `(projection,sourceEventId)`로 멱등 처리한다. 늦게 도착한 route도 P4의 즉시 directive 인덱스에서 ACK를 읽는다.

## 상태와 호환 pending

`posted → delivered → acked → applied`, 권한 있는 정정은 posted/delivered→superseded다. receipt는 전송 수신 증거이며 ACK가 아니다. 직접 TO의 직접 ACK만 acked, ACK가 먼저면 ack-evidence receipt를 만든다. 타인·mention·NOTE/CLAIM 참조 ACK는 댓글로 허용하고 TO 상태를 바꾸지 않는다. REPORT/VERIFY를 RE로 인용한 명시 apply만 applied로 간다. 적용 결과는 외부 실행 성공의 자동 인증이 아니다.

P4 저장 tx가 만든 reference/directive/CLAIM/HOLD 인덱스가 안전 판정 정본이다. 재전달은 공통 `pendingLegacy`를 issue 전체 이력·단일 수신 별칭에 적용한다. 모든 TYPE의 본인 RE 또는 모든 SUPERSEDES로 legacy가 해소돼도 ackState waiting은 남을 수 있다. receipt/retry는 상태를 후퇴시키지 않는다. 처리 cursor는 processed 근거 행의 연속 ordinal prefix다. GET·구독·peek는 processed를 만들지 않으며 지시는 ignored로 숨길 수 없다.

## 스케줄

ACK-BY에서 attempt1, +30초 attempt2, +120초 attempt3까지만 같은 delivery를 재알림한다. 첫 HOLD overdue와 일반 attempt3은 OWNER·감독·원발신자에 정보성 경보, 이후 15분 digest다. mention-only pending은 ACK 의무 없이 별도 정보성 digest로 합친다. 매 tick은 pending schedule≤100개를 독립 tx로 SKIP LOCKED 처리하며 전구간 legacy를 잠금 아래 재검사한다. 취소된 obligation을 재시작으로 되살리지 않는다.

에스컬레이션 정본은 internal:delivery 한 fact다. supervisor 채널 사본은 다시 alias fanout하지 않아 중복 알림을 막는다. alias fact를 같은 client로 append한 실제 sequence를 delivery.alias_event_sequence에 저장한 뒤 관련 queue도 같은 tx로 보낸다. append/send 실패는 projection·delivery·cursor·fact·queue 전체를 롤백한다.

## Pull snapshot

`InboxService.read`와 `readOn(tx,...)`는 canonical since-compact history+alias inbox를 합친다. 첫 pull은 가입 전 COMPACT와 이후 ALL을 포함하며 과거 delivery를 소급 생성하지 않는다. 전역 viewKey는 comment:<id> 또는 fact:<sourceEventId>다. OTHER는 봉투만, compact 원문은 별도 필드다.

커서는 principal/alias/sid/정렬 issue·board/me/sinceCompact에 결합된 불변 UUID이고 TTL30일이다. 페이지는 items·pending·H/A/E 경계를 고정해 저장한다. 마지막 페이지만 refreshCursor를 준다. refresh는 새 댓글 H, 새 ordinal A, 기존 delivery 변경 E의 합집합을 읽는다. attempt/state 변경은 alias fact와 같은 tx에서 sequence를 남겨 새 댓글이 없어도 회수한다. scope 밖 event도 E 경계에는 포함한다. 새 COMPACT면 snapshot bootstrap을 다시 만든다. own history와 inbox 중복은 한 행이며 늦은 route는 기존 행을 보강한다.

pull fetch는 해당 페이지 delivery의 http receipt를 만든다. snapshot은 receipt 직전의 고정 투영이며 새 receipt 상태는 다음 refresh에서 회수한다. snapshot token은 수신 확인/processed token과 교환하지 않는다.

## 시험

실DB/PGMQ·실제 HTTP/WS/SSE: [계획](../../../apps/issus/tests/plans/deliveries-20261021.md). 외부 wake adapter와 production 조립·배포는 별도 검증 경계다.
