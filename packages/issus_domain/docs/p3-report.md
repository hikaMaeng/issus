# P3 시험 계획·실행 기록

작성: 2026-10-21T05:43:29.841077+00:00 · issus-1-domain/s1 · Windows PowerShell/Node 26.4.0/Python 3.13 Unicode 15.1.0.

목표: design v2.1 §2–7·§13의 공통 계약을 정본과 대조하고 baseline을 실제 PostgreSQL에 적용한다. 전제: source Python snapshot hash 고정, P1 workspace 의존성 설치, loopback 시험 DB. 단계: byte fixture→Python dry-run/golden→TS parity·wire/logic→lint/build→SQL 격리 적용/제약→원상 복구. 예상: good32 pass, bad5 exact reject, 원문 hash 일치, test/lint/build exit0, SQL rollback 뒤 test schema 0개. 브라우저 locator는 해당 없음(common/SQL 범위).

| 실행 | exit | 관측/로그 |
| --- | --- | --- |
| `C:\Users\hika0\AppData\Local\Programs\Python\Python313\python.exe packages/issus_domain/tests/fixtures/issue-board-v2/tools/refresh-fixtures.py` | 0 | `.cache\p3\logs\python-fixtures.log` |
| `C:\Users\hika0\AppData\Local\Programs\Python\Python313\python.exe packages/issus_domain/tests/fixtures/issue-board-v2/tools/refresh-differential.py` | 0 | `.cache\p3\logs\python-differential.log` |
| `npm.cmd run lint -w issus_domain` | 0 | `.cache\p3\logs\lint.log` |
| `npm.cmd run build -w issus_domain` | 0 | `.cache\p3\logs\build.log` |
| `node node_modules/typescript/bin/tsc -p .cache/p3/test-tsconfig.json` | 0 | `.cache\p3\logs\test-types.log` |
| `node .cache/p3/run-emitted-tests.mjs` | 0 | `.cache\p3\logs\test-emitted.log` |
| `npm.cmd test -w issus_domain` | 1 | `.cache\p3\logs\npm-test.log` |
| `node packages/issus_domain/tests/fixtures/issue-board-v2/tools/schema-check.mjs` | 0 | `.cache\p3\logs\schema.log` |
| `docker compose up -d issus-db` | 1 | `.cache\p3\logs\docker.log` |

임시 JS emit은 **318 pass/0 fail/0 skip**. 시험 소스도 tsc로 별도 검사했다. 표준 npm test는 test worker spawn EPERM으로 기능 시험 전에 실패하여 호스트 재실행 대기다. Docker up은 npipe permission denied지만, 오케스트레이터의 네트워크 DECISION `6308921916` 뒤 loopback DB 실검증은 성공했다. 이 둘을 혼동하지 않는다.

SQL: baseline 1회 적용, 예상 **23개 테이블** 정확히 일치, **21개 확인항목 PASS**(Unicode casefold, owner 범위 FK, board/writer 유일성, append-only, codepoint 길이, raw token 거부, counter rollback, delivery 자연키/ordinal, 처리 근거, deferred FK 포함). 마지막 ROLLBACK 뒤 임의 시험 schema가 존재하지 않음을 확인했다. 운영 issus/public 변경 없음.

| Python/TS 교차 구분 | 파일 수 | Python 통과 | TS 통과 | 거부/정확 사유 일치 |
| --- | --- | --- | --- | --- |
| good comment | 28 | 28 | 28 | 0 |
| good issue-body | 4 | 4 | 4 | 0 |
| bad comment | 5 | 0 | 0 | 5/5 (사유 순서 포함) |
| 합계 | 37 | 32 | 32 | 5/5 |

추가 Python golden: validation=140, headers=22, masks=29, times=13, aliases=7, pending=15 (합계 226건). 별도 registry metadata/model 필드는 §4.3 현재 표를 따른다.

| fixture | Python dry-run | TS | 사유 배열 |
| --- | --- | --- | --- |
| `good/ack-accept.md` | PASS | PASS | 동일 (0건) |
| `good/ack-objection.md` | PASS | PASS | 동일 (0건) |
| `good/ack-yield.md` | PASS | PASS | 동일 (0건) |
| `good/alias-register.md` | PASS | PASS | 동일 (0건) |
| `good/alias-rename.md` | PASS | PASS | 동일 (0건) |
| `good/ask-noenv.md` | PASS | PASS | 동일 (0건) |
| `good/ask-slot-1.md` | PASS | PASS | 동일 (0건) |
| `good/ask-slot-2.md` | PASS | PASS | 동일 (0건) |
| `good/ask.md` | PASS | PASS | 동일 (0건) |
| `good/board-body.md` | PASS | PASS | 동일 (0건) |
| `good/board-lesson.md` | PASS | PASS | 동일 (0건) |
| `good/board-note.md` | PASS | PASS | 동일 (0건) |
| `good/claim.md` | PASS | PASS | 동일 (0건) |
| `good/compact.md` | PASS | PASS | 동일 (0건) |
| `good/decision-criteria.md` | PASS | PASS | 동일 (0건) |
| `good/decision-unhold.md` | PASS | PASS | 동일 (0건) |
| `good/decision-user.md` | PASS | PASS | 동일 (0건) |
| `good/handoff.md` | PASS | PASS | 동일 (0건) |
| `good/hold.md` | PASS | PASS | 동일 (0건) |
| `good/issue-body-cancelled.md` | PASS | PASS | 동일 (0건) |
| `good/issue-body-closing.md` | PASS | PASS | 동일 (0건) |
| `good/issue-body-running.md` | PASS | PASS | 동일 (0건) |
| `good/note-cc.md` | PASS | PASS | 동일 (0건) |
| `good/note-session-resume.md` | PASS | PASS | 동일 (0건) |
| `good/note.md` | PASS | PASS | 동일 (0건) |
| `good/plan-revision.md` | PASS | PASS | 동일 (0건) |
| `good/plan.md` | PASS | PASS | 동일 (0건) |
| `good/release.md` | PASS | PASS | 동일 (0건) |
| `good/report-final.md` | PASS | PASS | 동일 (0건) |
| `good/report-fix-candidate.md` | PASS | PASS | 동일 (0건) |
| `good/report-progress.md` | PASS | PASS | 동일 (0건) |
| `good/verify.md` | PASS | PASS | 동일 (0건) |
| `bad/alias-character.md` | REJECT | REJECT | 동일 (1건) |
| `bad/ask-no-to-two-requests.md` | REJECT | REJECT | 동일 (3건) |
| `bad/compact-no-marker.md` | REJECT | REJECT | 동일 (1건) |
| `bad/noenv-fix-candidate.md` | REJECT | REJECT | 동일 (1건) |
| `bad/plan-due-no-date.md` | REJECT | REJECT | 동일 (1건) |

미검증/이관: HTTP 인증·문맥/트랜잭션·실제 worker/WS/SSE·UI/전체 E2E는 후속 P4~P8 범위. 최상위 barrel 연결(ACK `6308582526`), pg8.23.1 devDependency 선언, SQL dist 자산 복사는 P1/오케스트레이터 요청에 남겼다. alias fact model 누락/재구축 공백은 ASK `6308925512` 판정 대기이며 현재 §4.3을 변경하지 않았다.

재현: 저장소 root에서 표의 명령. `.cache/p3/*`는 자체 실행 보조/로그, fixture tools는 저장 가능한 재현 도구다. 호스트 표준 npm test 결과는 `.cache/p3/orch-validation/`에 별도 보존하고 이 기록을 보완한다. source/fixture hash는 `tests/fixtures/issue-board-v2/manifest.json`, bad 사유는 `golden-errors.json`, 개별 Python stdout은 `.cache/p3/logs/python-{good,bad}-*.log`. 커밋·push 없음.
