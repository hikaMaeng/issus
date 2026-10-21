# 시험

기본 명령은 저장소 root에서 `npm test -w issus_domain`, `npm run lint -w issus_domain`, `npm run build -w issus_domain`이다. test는 node --test+tsx, lint는 tsc --noEmit이다. fixture는 패키지 cwd 기준으로 읽는다.

`validation/comment/fixture.test.ts`는 원본 46파일 SHA-256과 37행 합성 digest, good32/bad5의 실제 Python dry-run 결과·사유 순서를 대조한다. good의 `board-body.md`, `issue-body-*.md`만 body validator로 보낸다. `domain/parity.test.ts`는 Python이 생성한 추가 문법·날짜·header/classification/COMPACT·masking·거리·pending golden을 대조한다. `logic/domain.test.ts`는 window/global·REPORT RE/직접 ACK 분리·수신자·임계·역순 상태를 검사한다. `protocol/runtime/wire.test.ts`는 command15/fact28 shape, metadata 보존, unknown/server-only key·WS mutation 거부를 검사한다.

재생성 도구는 `tests/fixtures/issue-board-v2/tools/refresh-{fixtures,differential}.py`다. source root를 읽기만 하고 fixture만 쓴다. 정본 hash가 달라지면 DECISION 전 snapshot을 바꾸지 않는다. flows9는 개별 comment 통과 수에 포함하지 않는다.

`wire.test.ts`의 P2 교차 시험은 `agent/broker`의 실제 `createReactionWork`·`toEventDraft`를 호출한다. append가 맡는 sequence만 시험에서 부여하며 DB 영속을 주장하지 않는다. fact28개 변환, queue별 identity/중첩 source 보존, kind·source·audience·payload 거부를 검사한다. [계획](../tests/plans/reaction-input-20261021.md). s2 로그는 `.cache/p3-s2/logs/`이며 보조 실행은 P2를 cache에만 tsc emit한 뒤 workspace import를 연결하고 domain 소스는 native strip으로 읽는다. `--experimental-test-isolation=none` 실행과 표준 npm 시험을 구분한다.

실DB 검증은 `ISSUS_TEST_DATABASE_URL`을 설정한 뒤 `node packages/issus_domain/tests/fixtures/issue-board-v2/tools/schema-check.mjs`. 도구는 workspace exact pg8.23.1 시험 의존성을 사용한다. 임의 `p3_domain_<uuid>` schema에서 baseline 전체와 고유키·교차 owner·불변 comment·codepoint 길이·counter rollback·inbox 제약을 확인하고 최종 ROLLBACK으로 schema까지 제거한다. 운영 `issus`/`public`·볼륨을 변경하지 않는다. 실행기는 P4 소유다.

Codex 샌드박스에서 node test worker spawn EPERM이면 `.cache/p3/test-tsconfig.json`으로 시험까지 임시 JS emit 후 `.cache/p3/run-emitted-tests.mjs`를 실행한다. 이 결과와 표준 npm test 결과를 구분한다. host 검증 로그는 `.cache/p3/orch-validation/`, 자체 로그는 `.cache/p3/logs/`다. 실제 수치와 미실행은 [P3 실행 기록](p3-report.md)에 기록한다. 브라우저·HTTP·서비스 통합은 P4~P8 범위다.

P4 단위는 backend/command-result/index.test.ts의 key·canonical hash·metadata/개행 보존이다. 실제 원자성·멱등·auth·HTTP 시험은 apps/issus/src/server/http/auth/{core,fixtures}.test.ts가 이 공개 API를 사용한다. append/send 실패의 전체 롤백, 동일key 동시 요청, 다른 actor의 동일UUID, projection source 검증/1회 적용, HANDOFF·강화 ACK·close, 실제 워커 프로세스 crash3지점, preflight 전체 DB/PGMQ 차분0을 검증한다. 계획/실행 기록은 apps/issus/tests/{plans,reports}/core 경계다.

P6 [계획](../tests/plans/compact-20261021.md): `src/server/compact/{packet/packet,publication/integration}.test.ts`와 앱 HTTP compact 시험. DB URL 필수·skip 없음, 고유 schema/queue를 정리한다. Python packet parity는 `python tests/compact/generate-packet-parity.py`로 hash 고정 정본에서 재생성한다. 실DB/하네스 결과와 호스트 표준 npm test·배포/P5 전달 수용을 분리한다.

P6 s2는 정본 패킷31건·거부사유5건·ROT13 MASKS29건, 페이지 사이 새 COMPACT의 고정 경계, prepare 실패의 due/packet/command_result 롤백까지 검사한다. 임시 JS emit 단일 프로세스의 P6 domain83/83·HTTP4/4, 전체 domain441/441·app62/62를 확인했다. 표준 npm test의 spawn EPERM은 호스트 재실행 항목이다. [실행 기록](../tests/reports/compact/20261021_162100.md)에 명령·원 실패·재실행·수용 경계를 기록한다.
