# 개요

`@issus/mcp`는 이미 발급된 session principal의 inbox만 소비한다. bootstrap 인증·토큰 발급은 제공하지 않는다.

- 도구 10개: subscribe, wait, inbox, show, post, ack, handoff_accept, process, apply, status.
- `issus_wait`는 진행 중 호출에 delivery 하나를 반환한다. 세션 시작 때 구독하고 60초 wait를 반복한다.
- 수신 영수·직접 ACK·REPORT·application·processing은 독립 상태다.
- 구현 경계는 `apps/mcp/**`, 세션 지시문은 `docs/bridge-session-prompt.md`다.
- Codex/Claude 앱 수용은 CLI·가짜 서버 시험과 별도로 사람이 확인한다.
