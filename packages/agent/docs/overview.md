# 개요

`packages/agent`는 issus가 사용하는 도메인 중립 이벤트 기반 라이브러리다. PGMQ에 작업을 보관하고, PostgreSQL 이벤트를 append한 뒤 채널별 WS 수신자에게 재생한다. 스케줄러·라우팅·COMPACT·CLI 게시 규약은 도메인/앱 소유다.

버전 `0.1.0-issus.1`. 계정·로그인·가입·모델 추론·도구 실행을 포함하지 않는다. `Principal`과 `SessionVerifier`만 앱과 공유한다. 이벤트와 execution 결과는 자동 삭제하지 않으며 transport cursor TTL은 별도로 30일이다.

앱은 `GatewaySocketHooks`로 구독 수용·client receipt·send-success·종료를 영속 도메인 기록에 연결한다. ACK와 처리 cursor의 의미는 앱이 소유한다.
