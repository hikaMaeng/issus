# Test Plan: P7 CLI·공유 클라이언트

## Created
2026-10-21, issus-1-client/s1. 기준: design v2.1 §5·7·8·10 C-01, g1=6308181113.

## Goal
정본 good 32/bad 5의 post 출력·exit, watch 분류·커서, 독립 WS/SSE 소비와 receipt를 검증한다. P5/P6 운영 서버 수용은 P8 통합에서 별도 실행한다.

## Environment
Windows PowerShell, Node 26.4.0(제품 bundle target node24), TypeScript 7.0.2. npm workspace @issus/cli·issus_domain. API는 fetch 계약 모의 응답 및 실제 loopback HTTP/WS 모의 서버. 실제 DB·운영 token·GitHub 쓰기는 시험에 사용하지 않는다.

## Preconditions
P1이 `issus_domain/front` client/model export와 CLI ws exact dependency를 연결하고 domain을 build한다. Python 정본은 ISSUS_REFERENCE_SKILL 또는 사용자 지정 기본 스킬 위치에서 읽기만 한다. P3 fixture bytes를 변경하지 않는다. profile 시험에는 임시 디렉터리와 명시적 dummy token만 사용한다.

## Steps
1. `python apps/cli/tests/tools/python-reference.py post --out .cache/p7/python-post-results.json`: 정본 issue_post.py를 37회 실제 실행한다.
2. CLI `lint`·`test`·`build`와 domain `lint`·`test`를 실행한다.
3. 37개 dry-run stdout·exit를 Python 결과와 글자 단위 비교한다. good COMPACT에는 packet sidecar/sample/by를 추가하되 본문은 같은 파일 원문이다. good은 preflight 1회, bad는 0회, 실제 write는 0회여야 한다.
4. watch 11댓글 fixture를 원 Python에 주입한 분류 행·푸터와 비교한다. native golden은 §8에 따라 pending을 앞으로 옮기고 구간 밖 global pending만 추가한다.
5. peek 무쓰기, 반복 me/mine/board dedupe, full 원문, 여러 페이지 뒤 refresh commit, 2페이지 실패시 기존 상태 보존, 명시 처리 근거만 process 호출을 확인한다.
6. 실제 모의 WS/SSE로 bearer header·JSONL·UTF-8 chunk·재접속 cursor·event dedupe·동일 receipt key·새 attempt receipt·once 종료·subscription close를 확인한다. 댓글 ACK/process/application을 생성하면 실패다.
7. HTTP 202 최종 거부·timeout3·key/operation 보존, session 재생불가409 복구 안내, explicit reissue 새 key, board 0/1/3, alias owner-wide 검사, compact packet/sidecar를 확인한다.
8. 한글/공백/emoji Windows 경로, CRLF 원문, BOM 거부, codepoint 수, UTF-8 no BOM/LF 저장, secret 비표시, Windows profile 사용자전용 DACL을 확인한다. ACL 실패는 호스트 검증에 이관한다.
9. built Node CLI와 Python 정본을 각각 별도 프로세스로 실행하는 `tests/tools/binary-contract.py`로 fixture37+Windows 보충1을 비교한다. stdout hash·exit가 모두 같고 preflight33·mutation0이어야 한다.

## Expected Results
CLI·domain lint와 표준 npm test exit0. fixture37 stdout·exit 동일(32 pass/5 reject). peek는 pending 유무와 무관0. nonTTY 미처리 delivery/지시+증거 없음은3. profile 권한 실패시2이며 토큰 stdout fallback·토큰이 담긴 임시 파일은 없어야 한다.

## Logs To Capture
`.cache/p7/validation/*.log`, `.cache/p7/orch-validation/*.log`, Python 실실행 JSON, fixture cross table, 명령 exitCode. 표준 프로세스 격리 EPERM이면 사용자 허용 경로인 tsc 임시 JS emit와 `--test-isolation=none` 결과를 별도 기록한다. 보조 실행은 호스트 표준 성공을 대신하지 않는다.

## Locator Contract
P7은 React/DOM을 만들지 않는다. P8이 public `issus_domain/front`를 사용해 semantic markup·배포 브라우저 수용을 담당한다. P7 브라우저 시험은 N/A.
