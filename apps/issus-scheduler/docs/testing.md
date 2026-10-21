# testing

npm test --workspace issus-scheduler 및 npm run lint --workspace issus-scheduler. src/server/roles/tick 시험과 ../issus/tests/integration/deliveries/scheduling.test.ts에서 producer경합·재전달상한·digest·mention-only·48시간fact복구·복수broker lease를 검증한다. 계획/보고서는 ../issus/tests/{plans,reports}/deliveries 경로다. 실제 배포/DB재시작은 P1/P8 후속 운영 수용 경계다.

[wave3 실제 entry 계획](../../../tests/plans/wave3-assembly-20261021.md): worker 소비와5초 producer가 agent의 같은 DB pool을 사용하고 producer→worker/pool 순서로 종료한다. application readiness 훅의 후속 요청은6311965208이며 migration 누락 시 `/ready`503도 수용 조건이다.
