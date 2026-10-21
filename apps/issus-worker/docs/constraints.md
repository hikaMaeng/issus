# constraints

PORT는 환경 schema의10000–59999다. event/command 결과에 토큰·댓글 밖 비밀을 넣지 않는다. ACK를 기다리며 worker를 점유하지 않는다. P6 hook 미주입은 COMPACT 처리 완료를 뜻하지 않는다. 외부 wake는 기본 disabled, webhook/command/RemoteTrigger 실제연결은 미검증이다. /ready는 DB·migration·필수 큐·agent 소비 poll 준비 실패503을 반환한다.
