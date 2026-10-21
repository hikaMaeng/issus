# Test Plan: conditional-get

## Created
2026-10-21, issus-1-core/s7, ASK6318774227.

## Goal
이슈·목록·inbox 응답 전체와 ETag의 일치, 이전 If-None-Match의 변경 후200·무변경304를 실제 Postgres와 원시 HTTP로 확인한다. 쓰기용 revision 계약을 보존한다.

## Environment
Windows Node, ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus. startCoreHarness의 신규 랜덤 schema/queue·loopback 임시 listener만 사용하고 finally 정리한다. dist·운영 데이터는 변경하지 않는다.

## Preconditions
기존 Postgres+pgmq 접속 가능, workspace 의존성 설치 완료. Clock은 주입된 2026-10-21T04:00:00Z로 고정한다. 조건부 요청은 fetch의 자동 no-cache를 피하고 node:http로 보낸다.

## Steps
1. 저장소·두 별칭·세션·이슈를 실제 HTTP로 생성한다.
2. 상세 GET의 실제 bytes SHA-256 일치·동일 ETag304·약한 validator/목록/*·빈304·인증 선행을 검사한다.
3. HOLD 게시·ACK·해제 DECISION·CLAIM/RELEASE 뒤 revision이 같아도 응답 ETag가 달라지고 이전 조건부 요청이200인지 확인한다.
4. compact 파생 상태만 바꿔 동일 규칙을 확인하고 숫자 revision PATCH의 성공·stale412를 확인한다.
5. 목록은 동일 표현304·참여 필터 변화200, inbox는 실제 새 snapshot/cursor를 포함한 전체 body 해시·HOLD/ACK 변화를 확인한다. 새 cursor는 다른 표현이므로 무변경 도메인에서도200일 수 있다.
6. 앱 npm test/lint와 임시 source emit node --test를 실행하고 명령·exit·실제 수치를 보존한다.

## Expected Results
본문과 ETag의 불일치0, 동일 표현304/빈본문, 변경 표현200, private/no-cache와 Authorization/Cookie Vary, Last-Modified 미발급, 숫자 revision If-Match 유지. 자기 schema/queue/listener 잔류0.

## Logs To Capture
.cache/core-s7/{commands.jsonl,regression.log,app-source.log,lint.log,standard-test.log,evidence.json}.

## Locator Contract
서버 HTTP 회귀, DOM·브라우저는 비범위. 호스트 deploy·p9-host47은 orch 후속 수용이다.
