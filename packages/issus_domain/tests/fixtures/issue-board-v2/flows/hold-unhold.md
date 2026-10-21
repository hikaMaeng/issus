# (b) HOLD → ACK → DECISION(SUPERSEDES)로 해제

1. 감독 `hold.md` — TO는 **실행자**(중계자 아님), ACK-BY ≤10분, 중단 대상 1줄, `SEEN:`.
2. 실행자 `ack-accept.md` — 즉시 중단, `STATE:hold`, 중단 시각·프로세스 상태·산출물 보존.
3. 사유가 해소되면 **오케스트레이터** `decision-unhold.md` — `SUPERSEDES:<hold id>`, 재착수 범위·GATE 증거 id. ACK·이슈 이동·소통 방식 변경으로는 해제되지 않는다.
4. 실행자 `ACK RE:<decision id>` 뒤 착수. HOLD 뒤 실행이 발견되면 게시·SEEN·착수 시각으로 미수신/무시 판정(delivery.md#HOLD).
