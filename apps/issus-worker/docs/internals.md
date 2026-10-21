# internals

intake/delivery 명령은 P4 reserveCommand/finishCommand와 같은 actor/key/result를 사용한다. routing/compact 전용 큐와 source3이 있는 혼합 delivery 반응은 agent의 reaction 검사를 통과해야 한다. routing은 verifyReactionSource/applyProjection, ACK는 동기 인덱스, retry는 full-history pendingLegacy를 사용한다. executeIngress 직전/커밋 전 execution fence를 재검사한다. SIGTERM/SIGINT는 runService가 큐 소비 중단→inflight 완료→pool 종료를 수행한다.
