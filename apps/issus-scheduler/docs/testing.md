# testing

npm test --workspace issus-scheduler 및 npm run lint --workspace issus-scheduler. src/server/roles/tick 시험과 ../issus/tests/integration/deliveries/scheduling.test.ts에서 producer경합·재전달상한·digest·mention-only·48시간fact복구·복수broker lease를 검증한다. 계획/보고서는 ../issus/tests/{plans,reports}/deliveries 경로다. 실제 배포/DB재시작은 P1/P8 후속 운영 수용 경계다.

[wave3 실제 entry 계획](../../../tests/plans/wave3-assembly-20261021.md): worker 소비와5초 producer가 agent의 같은 DB pool을 사용하고 producer→worker/pool 순서로 종료한다. wave3 initialize/ready 훅을 연결했다. 전용 deliveries/readiness.test.ts는 migration/큐 누락503·복구200·DB 접속불가에서도 health200을 검증한다.

producer는 첫 실행 전·최근 실패·종료 후 준비를 거부하며 다음 tick 성공으로 회복한다.
