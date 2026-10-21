# usage

루트에서 `npm run build --workspace=issus_runtime`. `DATABASE_URL`, `ISSUS_OWNER`, `ISSUS_BOOTSTRAP_TOKEN_FILE`, `ISSUS_ORIGIN`, `PORT`를 검증한 config로 생성한다. 토큰 파일의 실제 내용은 로그·예시·명령행 인자에 넣지 않는다.

P1 조립은 EventStore/PgmqClient로 UoW를 만든 뒤 `runMigrations({pool,ensureBroker:()=>store.ensureSchema()})`, `new RuntimeAuth({uow})`, `new IntakeService({uow,resolvePrincipal:a=>auth.resolveActor(a)})`를 연결한다. `createHealth`에 migration 완료 이후의 실제 ready 상태를 제공한다. P4 하네스는 이와 별개로 listening Express 앱을 만든다.

self-contained app bundle은 workspace package resolve를 사용할 수 없다. P1 빌더가 baseline SQL을 app dist/migrations에 복사하고 entry가 읽은 `baselineSql`을 runMigrations에 주입한다. 추가 순번 파일은 directory로 주입한다. 소스 workspace 실행의 기본 SQL resolve와 배포 bundle asset 연결을 구별한다.

세션 응답 유실: 기존 key 재시도 →409의 sessionId 확인 →bootstrap으로 새 key/미사용 새 sid/reissueOf 지정 →새 token1회 응답을 제한된 profile에 저장한다. 다른 alias·오래된 session·기존 sid는 SESSION_CONFLICT다.
