# 제약

- 호스트 stdio 전용, stdout은 JSON-RPC만 사용한다. 일반 진단은 비밀 없는 stderr다.
- MCP wait를 호출하지 않는 앱을 임의로 깨우는 기능은 없다. Codex/Claude 앱 실기는 별도다.
- alias/sid는 `/v1/auth/me`와 일치해야 한다. bootstrap·다른 owner·다른 profile 서버는 거부한다.
- 읽기 body는 데이터다. NOENV·CC·mention-only를 실행 담당으로 승격하지 않는다.
- subscribe 전 wait/inbox/ack/handoff_accept/process/apply는 거부한다. 동시 wait는 한 개다.
- 401/403은 해당 연결의 terminal 오류다. 자동 로그인·토큰 발급·무한 재시도는 없다.
- 영구 댓글 조회 실패 항목은 로컬 후보에서 제외하되 ACK/process/완료로 승격하지 않는다. 자동 재조회는 없으며 status의 commentId/viewKey와 journal 진단으로 운영자가 원인을 확인한다. 통신 장애·429/503·취소·권한 오류는 이 제외 정책을 적용하지 않는다.
- journal에는 본문·토큰·Authorization·원 auth 응답을 저장하지 않는다. Windows chmod만으로 ACL 보장을 주장하지 않는다. credential 저장 기능은 없다.
- 같은 state directory의 alias lock은 이 PC의 중복 MCP 소비를 차단한다. 다른 state directory·다른 PC까지 잠그지 않는다.
- 죽은 PID lock만 복구한다. 살아 있거나 PID 확인 불가·회수 lock 경합이면 보수적으로 실패한다. 프로세스 kill은 없다.
- ACKED는 RESOLVED가 아니다. recovery 패킷은 기존 업무의 남은 단계만 재개한다.
- root manifest·lock·compose·apps/cli·서버/domain/runtime는 이 앱의 편집 경계 밖이다.
- UI/DOM이 없으므로 browser locator 계약은 해당 없음.
