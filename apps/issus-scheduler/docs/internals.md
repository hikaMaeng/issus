# internals

producer의 schedule(kind=clock,entity=UTCslot,generation=0)과 pgmq.sendOn은 한 tx다. scanner는 owner→schedule SKIP LOCKED→delivery 잠금 아래 pendingLegacy.global을 다시 계산한다. 항목마다 독립 UoW를 커밋한다. source overdue/retry/escalation key는 delivery+attempt/generation이므로 중복 tick도 같은 알림을 만들지 않는다. 초기 HOLD 경보와 supervisor 사본을 alias에 이중 fanout하지 않는다. backlog/oldestLagMs는 tick 결과로 돌려준다.
