# architecture

packages에서 apps를 import하지 않는다. 패키지 간 참조는 workspace 이름을 쓴다.

기동 순서: env-schema 검증 → pool 생성 → schema lock 아래 migration/PGMQ 큐 준비 → EventStore.ensureSchema → bootstrap hash 설치 → RuntimeAuth/IntakeService/HTTP 조립 → broker·worker 초기화 → ready. health의 initialized 콜백에 실제 브로커 초기화 상태를 연결한다.

RuntimeAuth는 domain의 동일 EventUnitOfWork를 받아 세션/hash·metadata fact·명령 결과를 원자 저장한다. verifier는 DB SELECT만 하며 positive cache/last-seen 쓰기가 없다. 여러 broker는 revoke를 매 검증 때 관측하며 기존 stream의 재검증/종료는 P1/P5가 onRevoked와15초 재검증으로 연결한다.
