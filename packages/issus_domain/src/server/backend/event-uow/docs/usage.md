# 사용

handler는 `tx.client`로 projection을 기록하고 `tx.fact`·`tx.enqueue`를 호출한다. COMMIT·release를 직접 호출하지 않는다. 재시도되는 work에는 트랜잭션 밖의 비가역 부작용을 넣지 않는다. 명령 key와 identityScope를 전달하면 기존 fact 멱등 identity가 유지된다.
