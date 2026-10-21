# overview

P4는 `server/{config,auth,migrations,health}`를 제공한다. 도메인 명령·투영·UoW는 issus_domain, 브로커·PGMQ는 agent가 소유한다. P5 worker-bindings/scheduler/adapters는 별도 경계다. 실제 기동 entry·비밀 파일 배포·compose 변경은 P1에 요청한다.
