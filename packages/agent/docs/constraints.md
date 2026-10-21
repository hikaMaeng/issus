# 제약

- WS UUID parser는 v1–8과 표준 variant만 허용한다. 영수 v8 허용이 소유권 검사를 대체하지 않으며 subscription/session/cursor 검증과 도메인 receipt 검사는 유지한다.
- worker readiness는 앱 `initialize`·`ready`를 통해 migration/필수 loop 준비를 주입받는다. 초기화 성공만으로 준비 완료를 판단하지 않고 모든 소비 큐의 실제 read 성공을 요구한다.
- `projectEvent`는 payload 투영만 허용한다. 좌표/action/audience/provenance 변경 및 canonical fact 수정은 금지다.

- PostgreSQL canonical stream sequence는 10진 문자열 bigint다. 다른 stream 순번끼리 비교하지 않는다. 앱의 canonical fact는 session별이 아니라 설계의 채널 stream을 명시한다.
- `appendManyOn`/`sendOn` 호출자는 반드시 열린 동일 transaction client를 전달한다. broker는 외부 tx를 commit하지 않는다.
- 이벤트·execution 결과 자동 prune 없음. `prune(null)`은 SQL을 보내지 않는다. cursor TTL은 별도 30일이며 만료/다른 scope는 HTTP410/409 또는 WS error 후1008이다.
- reaction provenance는 server-only top-level 3개 묶음이다. payload를 바꾸거나 자기 react identity로 fallback하지 않는다. 앱 UoW가 원 fact의 owner/action/좌표를 대조해야 한다. 모든 reaction queue를 `reactionQueues`에 등록한다.
- 반응 terminal result/conflict는 요청의 `worker` audience를 유지하며 replyChannel이 없어도 client high-water·replay에서 제외된다. 원 client 요청의 결과는 client audience다.
- `readEnv`는 `PORT` 정수 10000–59999와 `AGENT_EXECUTION_LEASE_SECONDS > QUEUE_VISIBILITY_TIMEOUT_SECONDS`를 기동 전에 검사한다. 생략 시 port18081, visibility60/lease120이며 visibility만 바꾸면 lease 기본값은 그 2배다.
- 모든 WS 구독에 `authorizeChannel`; `onSubscribe`가 앱의 subscriptionId와 채널 결합을 검증한다. `onReceipt`가 delivery/attempt 내용을 해석한다. token 철회는 새 frame 및 최대15초 주기로 재검증한다.
- `onSubscribe`의 bootstrap event 배열은 기존 event wire만 사용한다. 구독 밖 canonical history의 repo/scope 권한은 앱이 별도 검사한다. worker audience·control/malformed frame은 거부하고 canonical envelope를 다시 저장하지 않는다. bootstrap cursor는 구독의 기존 positions를 유지한다. metadata/items는 §5.5 앱 HTTP builder 응답이며 신규 bootstrap wire는 제공하지 않는다.
- send-success는 전송 증거이며 client receipt·TYPE:ACK·processed가 아니다. hook은 이벤트로부터 deliveryId/attempt를 직접 검사한다. 비동기 hook은 유한 시간 내 완료해야 하며 transport가 임의 timeout/성공 판정을 만들지 않는다. 종료 hook 실패는 `websocketHookFailures`로 관측하고 앱에서 복구한다.
- 로컬 철회 감시는 동기 등록/해제 계약이다. `watchRevocation`이 받은 revoke 함수만 즉시1008을 일으키고, 등록·해제는 연결마다 한 번이다. 앱은 RuntimeAuth 신호의 세션 필터를 수행한다. 다른 broker 감시 주기는15초로 유지한다.
- subprotocol은 명시된 `selectProtocol`만 선택하며 기본 echo가 없다. 인증 토큰 추출·query token 거부·공개 protocol allowlist는 앱이 제공한다. `initialSubscribe`도 기존 frame·세션·채널·cursor 검증을 우회하지 않는다. Monitor의 도메인 채널/metadata 계산은 앱 소유다.
- mailbox/replay 기본256, buffered bytes1MiB. progress만 생략 가능. fact·HOLD·DECISION/control 초과는 느린 연결만1013 종료한다. client는 마지막 수신 token으로 재생하고 eventId로 중복 제거한다.
- generic `emit`은 progress만 허용한다. fact/control을 emit하면 성공 종결을 막고 원 큐를 남긴다. 미분류 예외도 보수적으로 재시도하며 운영 경보로 해결한다.
- 쿠키 추출·origin allowlist·CSRF·subscription 등록·처리 cursor는 앱 소유다. query bearer·계정 proxy·로그인/signup은 제공하지 않는다.
- `/ready`의 선택 `ready` hook은 `Promise<void>` 계약이다. 앱 검사가 `{ok:false}`를 반환하면 호출자가 throw로 변환해야 한다. hook은 요청마다 실행되며 결과를 캐시하지 않는다. hook 생략은 도메인 준비 상태를 보증하지 않는다.
- 패키지는 DOM을 렌더링하지 않는다. semantic markup/locator 계약과 deployed browser 검증은 앱이 담당한다.
