# testing

npm test --workspace issus-scheduler 및 npm run lint --workspace issus-scheduler. src/server/roles/tick 시험과 ../issus/tests/integration/deliveries/scheduling.test.ts에서 producer경합·재전달상한·digest·mention-only·48시간fact복구·복수broker lease를 검증한다. 계획/보고서는 ../issus/tests/{plans,reports}/deliveries 경로다. 실제 배포/DB재시작은 P1/P8 후속 운영 수용 경계다.
