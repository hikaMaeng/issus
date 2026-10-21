# constraints

포트는 검증된 환경값10000–59999를 사용한다. /ready는 runtime health가 DB/pgmq/migration/필수 큐/초기화를 모두 확인해야200이다. P1 production entry가 P4 라우터를 연결하기 전의 골격 ready를 기능 검증으로 쓰지 않는다.

JSON 상한64KiB, 댓글4000 codepoint, COMPACT2000, board NOTE1500. unknown metadata·외부 actor/repoId/issueNumber/provenance를 거부한다. body는 trim/개행 정규화 없이 저장한다. bearer/cookie/query/body를 access log에 기록하지 않는다. query token 금지, wildcard CORS 없음, cookie는 HttpOnly/SameSite=Strict/TLS Secure이며 local HTTP는 loopback origin만 허용한다.

UI는 AppShell의 main·주 탐색 nav 각1개와 페이지 제목 h1 하나를 노출한다. getByRole(main), getByRole(heading,{level:1}) 및 페이지별 이름을 사용한다. 고정 명칭·testid는 [front 제약](../src/front/docs/constraints.md)과 docs/ui.md §5가 정본이다. P4는 front 파일을 변경하지 않는다.

P6 packet token은 인증을 대체하지 않으며 URL query·access log·공개 comment metadata에 넣지 않는다. markdown 헤더를 포함한 응답은 no-store다. 서버가 요약을 쓰거나 외부 agent를 기동하지 않는다.

U3 웹은 PENDING-ACK legacy와 강한 ACK 상태를 분리하며 영수/조회로 ACK·applied·processed를 추정하지 않는다. packetToken은 메모리 해당 패킷에만 묶고 markdown/DOM/로그에 넣지 않는다. WS 오류는 자동 SSE 전환으로 숨기지 않는다.
