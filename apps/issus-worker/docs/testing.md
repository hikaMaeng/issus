# testing

npm test --workspace issus-worker 및 npm run lint --workspace issus-worker. 실DB/PGMQ·HTTP/WS/SSE 독립 조립은 ../issus/tests/integration/deliveries, 계획은 ../issus/tests/plans/deliveries-20261021.md다. 큐별 역할 검사는 src/server/roles의 node:test다. sandbox spawn EPERM은 원 로그와 임시 JS emit 결과를 분리한다. 실제 production entry/컨테이너는 P1 조립 뒤 검증한다.

[wave3 실제 entry 계획](../../../tests/plans/wave3-assembly-20261021.md): 4큐의 공개 worker binding에 P6 publication/reaction을 주입한다. application readiness 훅의 후속 요청은6311965208이며 migration 누락 시 `/ready`503도 수용 조건이다.
