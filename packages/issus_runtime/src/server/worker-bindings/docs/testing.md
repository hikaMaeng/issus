# testing

readiness.test.ts는 DB·extension·migration·큐 누락과 복구를 검사한다. apps/issus/tests/integration/deliveries/readiness.test.ts는 production worker/scheduler factories의 HTTP503/200과 DB 접속불가 생존을 실제 DB에서 검증한다.
