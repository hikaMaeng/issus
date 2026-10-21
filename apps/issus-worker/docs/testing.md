# testing

npm test --workspace issus-worker 및 npm run lint --workspace issus-worker. 실DB/PGMQ·HTTP/WS/SSE 조립은 ../issus/tests/integration/deliveries, 계획은 ../issus/tests/plans/deliveries-20261021.md다. 큐별 역할 검사는 src/server/roles의 node:test다. sandbox spawn EPERM은 원 로그와 임시 JS emit 결과를 분리한다. 실제 entry factory는 assembled-flow/readiness 시험으로 검증하며 배포 컨테이너는 P1의 별도 운영 수용 경계다.

[wave3 실제 entry 계획](../../../tests/plans/wave3-assembly-20261021.md): 4큐의 공개 worker binding에 P6 publication/reaction을 주입한다. wave3 initialize/ready 훅을 연결했다. 전용 deliveries/readiness.test.ts는 migration/큐 누락503·복구200·DB 접속불가에서도 health200을 검증한다.
