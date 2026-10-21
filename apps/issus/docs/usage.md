# usage

루트 npm run deploy 또는 npm run deploy -- issus로 배포한다. 기본 UI는 http://127.0.0.1:18140, 준비 응답은 /ready다.

P4 HTTP 하네스 시험은 루트에서 ISSUS_TEST_DATABASE_URL을 설정하고 `npm test -w issus`를 실행한다. 프로덕션 조립은 createCoreHttpRouter·RuntimeAuth·migration/health를 P1 entry에 연결한 뒤 검증한다. standalone 하네스의 PASS를 배포 상태로 사용하지 않는다.
