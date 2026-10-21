# Test Plan: P9 경로 조립과 인증 초안

## Created
2026-10-21 · issus-1-ui/s3 · DECISION6316344821 P1-1/P1-2.

## Goal
Board·IssueCreate·IssueEdit·Compact 실제 경로와 401/만료 뒤 동일 principal/경로의 명시 초안 복원을 확인한다. 다른 별칭/sid/경로의 초안을 복원하지 않고 편집 If-Match와 COMPACT 검토 경계를 보존한다.

## Environment
F:/dev/issus main, 기존 exact 의존성. source node:test는 JS emit와 jsdom 없는 SSR. Playwright는 npm run deploy의 production assets를 제공하는 p9-host.mjs 격리 인스턴스, 실제 Postgres/PGMQ·브라우저·두 별칭을 사용한다.

## Preconditions
오케스트레이터가 호스트에서 lint/test/build/deploy를 실행한다. ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus, ISSUS_TEST_SERVER_URL=http://127.0.0.1:18141를 공급한다. secret은 기존 fixture가 메모리 발급하며 파일을 읽지 않는다. 표준 runner는 browser 파일 직렬·Clock 전달을 유지한다.

## Steps
1. npm run lint -w issus; npm test -w issus. 샌드박스 spawn EPERM은 본문 실패와 구분한다.
2. tsc 임시 JS emit 후 source 앱/프런트 node:test, esbuild front/server와 browser syntax 검사를 수행한다.
3. 호스트에서 npm run deploy 후 `node apps/issus/tests/browser/p9-host.mjs --standard`를 실행한다. 기존38+추가6=44 test가 등록돼야 한다.

| ID | 절차 | 기대 |
| --- | --- | --- |
| P9-R1 | 네 신규 URL 직접 진입, 뒤로/앞으로 | 실제 page/form/region, main/h1 각1, 준비중0 |
| P9-R2 | 댓글 작성→cookie 제거→실제401→B 재연결→A 재연결→복원 | B 노출0, A 자동복원0, 버튼 뒤 raw byte 동일, 게시0·token/body storage0 |
| P9-R3 | 개설 title/raw/미적용 구조화 입력→401→복원 | 세 값 모두 동일, 자동개설0 |
| P9-R4 | 편집→401→실서버 본문 변경→재연결·복원→저장 | 원 If-Match, 실제412·최신 원문 비교, 사용자 초안 유지·overwrite0 |
| P9-R5 | prepare·표본 대조·COMPACT 초안→401→복원 | 본문/author 보존, packetToken/현재표본/다운로드/게시 복구0·새 검토 필요 |
| P9-R6 | API의 실제 expiresAt 직전 browser Clock→실제 타이머→재연결·버리기 | 인증 화면·스트림0·CSRF0, 자동복원0·명시 버리기 |

## Logs To Capture
.cache/ui-s3/commands.jsonl·소스 TAP·lint/bundle·browser-syntax·변경 파일 해시. 호스트 p9-u1/browser/observed.json·마스킹 PNG, p9-ui/host-*/browser.log·results.json 및 schema/queue 잔류0.

## Locator Contract
ui.md §5의 role/label/testid를 유지한다. 추가 행동은 실제 button `보관한 초안 복원`·`보관한 초안 버리기`, 안내 status. CSS 클래스/XPath는 쓰지 않는다. Clock은 browser JS 타이머만 전진하고 서버 TTL/API payload는 바꾸지 않는다.
