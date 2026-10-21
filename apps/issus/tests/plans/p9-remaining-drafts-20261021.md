# Test Plan: P9 잔여 폼 초안·별칭 문서

Created: 2026-10-21 · issus-1-ui/s4 · DECISION6317481308.

목표: HANDOFF·빠른 ACK·inbox ACK의 실제401→동일 principal 재인증→명시 복원, 별칭 등록201·개명200 동기·멱등 문서 계약.

환경·선행: main fca89f9+소유 변경. source는 기존 의존성·임시 JS emit 및 loopback PostgreSQL 전용 harness만 사용한다. 브라우저는 orch의 `npm run deploy` 완료 후 production assets를 사용하는 일회용 `p9-host.mjs` 대상이다. bootstrap은 runner의 메모리 발급 값이며 파일을 열지 않는다.

| ID | 실행 단계 | 예상 결과 |
| --- | --- | --- |
| source | 표준 앱 lint/npm test, tsc emit, front node:test, 앱 전체 source 실DB, front/server esbuild | 실제 exit·pass/fail/skip 기록. spawn EPERM은 호스트 재실행으로 분리 |
| SSR | delivery/index.test.tsx의 inbox ACK 복원 | 복원 전 기본값, 명시 복원 뒤 escaped 원문, 같은 inbox의 repo/issue/comment 슬롯 격리 |
| P9-R7 | 이관 작성 TO/ACK-BY/REPLY-IN/본문/deferred 입력·대상 확인→cookie 제거·auth/me401→동일 A 재연결→기본값 확인→닫기·명시 복원·이관 재열기 | 5입력 원문 일치, 대상 확인 상태는 초기화·재확인 후 게시 가능, DB 댓글 증분0 |
| P9-R8 | 같은 이슈 ASK2개→첫 빠른 ACK 편집→실제401·동일 A 재연결→기본 ACK 확인→명시 복원 | 다른 댓글에 편집 내용 없음, 원 댓글의 raw/줄바꿈/끝 공백 일치, DB 증분0 |
| P9-R9 | 두 이슈 ASK3개→첫 inbox ACK 내용 편집→실제401·동일 A 재연결→기본값 확인→명시 복원 | 다른 댓글/이슈에 편집 내용 없음, 원 댓글 내용 일치, 두 이슈 DB 증분0 |
| 문서·경계 | api.md 별칭2행·ui.md 별칭1행, git diff·UTF8/LF·기존 P8 browser byte 비교 | 해당 행에202 없음, 등록201/개명200 동기 완료·원 응답 멱등 재생 명시, 타 소유 변경0 |

Locator: 기존 `이관`·`수신 확인 미리보기` dialog, 실제 form/button/label을 사용한다. inbox는 승인 `delivery` testid와 정확한 h2 `ME · <commentId>`로 scope한다. CSS/XPath/DOM 순서 locator를 추가하지 않는다. 성공 API mock 없이 실제 auth/me401 응답을 기다린다.

호스트 명령(PowerShell, orch):

```powershell
$env:ISSUS_TEST_DATABASE_URL='postgresql://issus@127.0.0.1:15440/issus'
npm run lint -w issus
npm test -w issus
npm run deploy
$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18141'
node apps/issus/tests/browser/p9-host.mjs --standard
```

기존44+신규3=47개 실제 browser test. runner 목록·dist는 변경하지 않는다. 포트 점유·배포 순서·실행은 orch가 조율한다.

로그: `.cache/p9-ui-s4/{commands.jsonl,*.log,static-check.json,db-residue.json}`, 호스트 `.cache/p9-ui/host-*/{browser.log,results.json}` 및 `.cache/p9-u1/browser/{observed.json,*.png}`. 토큰·cookie·Authorization·인증 trace는 산출물에 넣지 않는다. 사람 테마 확인은 orch의 별도 마지막 증거다.
