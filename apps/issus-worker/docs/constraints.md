# constraints

PORT는 환경 schema의10000–59999다. event/command 결과에 토큰·댓글 밖 비밀을 넣지 않는다. ACK를 기다리며 worker를 점유하지 않는다. P6 hook 미주입은 COMPACT 처리 완료를 뜻하지 않는다. 외부 wake는 기본 disabled, webhook/command/RemoteTrigger 실제연결은 미검증이다. agent worker readiness hook 연결 전 /ready의 DB 단절 검증은 미완료이며 후속 검증 결과를 보고서에 기록한다.
