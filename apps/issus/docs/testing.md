# testing

npm test와 npm run lint를 workspace 단위로 실행한다. 실제 DB·배포 검증은 별도 기록한다. `ISSUS_TEST_DATABASE_URL`이 있을 때 auth/core.test.ts·fixtures.test.ts가 loopback listening Express+실제 PG/PGMQ를 사용한다. env가 없으면 DB 시험 skip이며 PASS로 해석하지 않는다.

[P4 계획](../tests/plans/core-20261021.md): I-02 핵심 멱등/중복·I-07 close/handoff·I-08 실제 워커 프로세스 종료 회복·preflight 무변경·세션 예외·문법32/거부5/실제게시28·본문교체4. I-02 delivery/receipt는 P5 소유라 별도 검증한다. fixture COMPACT1개는 v2.1 정확 footer를 덧붙인 live 변형이며 원문32의 문법 검증과 구별한다.

로그/수치는 tests/reports/core와 `.cache/p4/`에 보관한다. Codex 환경의 tsx/esbuild spawn EPERM은 표준 npm 실패로 기록하고 tsc 임시 JS emit+node --test로 같은 시험을 수행한다. 해당 하네스의 성공은 production entry·Docker·브라우저 시험을 뜻하지 않는다.

UI는 main 랜드마크1개와 이름 issus인 level-1 heading을 노출한다. getByRole(main),getByRole(heading,{name:issus,level:1})를 사용한다. P4에는 UI 조작 시험이 없다.

P6 `src/server/http/compact/compact.test.ts`는 실제 Postgres/PGMQ·loopback Express·P4 auth/submitter로 status204/packet JSON·markdown/prepare 멱등·metadata/원자 pointer/기본 읽기 경계를 검사한다. DB URL이 없으면 실패하며 skip하지 않는다. 계획·실행 기록은 [domain compact 시험](../../../packages/issus_domain/tests/plans/compact-20261021.md)에 둔다. P6는 UI를 변경하지 않는다.
