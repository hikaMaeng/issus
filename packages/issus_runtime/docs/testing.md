# testing

`npm test -w issus_runtime`, `npm run lint -w issus_runtime`. config 단위 시험은 필수 DATABASE_URL·포트 범위·기본 TTL을 확인한다. 실제 session/UoW/migration/health 검증은 apps/issus/src/server/http/auth/core.test.ts의 독립 Express+Postgres 하네스에서 수행한다.

실DB는 `ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus`. session 최초 응답·동일key409·지문충돌·재발급 원자성·hash-only 저장·폐기token401·system 발급403·CSRF·동시 migration/checksum 거부를 검증한다. 실제 실행 수치는 apps/issus/tests/reports/core/에 기록한다. 환경 제한으로 표준 runner가 실패하면 임시 JS emit+node --test 결과와 구분한다.
