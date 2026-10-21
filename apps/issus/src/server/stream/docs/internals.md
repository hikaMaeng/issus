# internals

별칭 stream에서 해당 sequence 이하 상태 fact·attempt를 집계하여 재생 상태를 고정한다. 구독 receipt와 history_snapshot.receiptPositions는 한 UoW에서 확정한다. socket send는 checkpoint를 바꾸지 않으며, 앞선 미영수 delivery attempt가 있으면 그 직전으로 제한한다. 닫힌 id와 무파라미터 재접속은 새 id/immutable cursor로 승계한다.
