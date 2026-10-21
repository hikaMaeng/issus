# 내부 계약

receipt 대상은 delivery queued/redelivered/escalated 중 deliveryId+attempt가 있는 알림이다. HTTP receipt 성공 뒤만 event cursor를 저장한다. 동일 eventId replay는 stdout 중복 없이 receipt를 재시도한다. key factory는 operation identity별 같은 UUID를 제공해야 한다.

1001/1013·일시 장애는 기존 구독을 폐쇄하고 generation을 늘려 새 key/구독을 발급한다. 최초 checkpoint가 closed=false여도 재사용하는 값은 같은 scope/channel의 확정 cursor뿐이다. 호출자는 checkpoint를 scopeKey별로 격리한다. 1008/401/403은 종료다. 만료/scope cursor 오류는 새 snapshot부터 시작한다. snapshot 복구 때 ordering만 초기화하고 eventId dedupe는 유지한다. 동일 delivery를 새 구독으로 영수할 때는 subscriptionId가 달라져 receipt key도 새 identity다.

once는 delivery 영수 후만 반환한다. untilMs는 AbortController로 WS/SSE·HTTP 영수·backoff를 중단하며 만료는 StreamTimeout이다. once/취소/만료의 close는 token revoke·업무 처리와 관계없다.

InboxModel의 refresh는 완결 snapshot만 교체한다. sequence 비교는 BigInt이며 같은 attempt의 delivered→acked도 최신 aliasEventSequence로 갱신한다. 호출자가 전체 snapshot output 실패시 변경된 메모리를 persist하지 않아야 한다.
