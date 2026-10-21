# 공개 API

`EventUnitOfWork.run(work,key?,identityScope?)`은 쓰기, `read(work)`는 repeatable-read read-only, `snapshot(work)`는 cursor 저장이 가능한 repeatable-read 쓰기다. `EventTransaction.fact`와 `enqueue`는 `flush`에서 같은 Client를 사용한다. 기존 export와 인자는 유지한다.
