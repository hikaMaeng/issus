# 수용 기준 대조

[design §14](design.md#14-수용-기준-대조표)를 구현 경로·시험 id에 대응한다. 구현됨은 배포/실기 전체 PASS를 뜻하지 않는다. 최신 실행 수치는 [P8 보고서](../apps/issus/tests/reports/p8-acceptance/20261021_190000.md)를 따른다.

후속 DECISION6313571462의 구현·검증은 [P8 s2 보고서](../apps/issus/tests/reports/p8-acceptance/20261021_193700.md)가 최신이다(source77/77·실DB83검사, 배포12개는 호스트 판정).

| brief | 구현 | 시험 id·근거 | 수용 잔여 |
| --- | --- | --- | --- |
|1 도메인 | domain common·intake, core HTTP repo/issue/comment/alias/board/handoff/closing | U-V/U-A·I-02/I-07·I-V1, P4 core/fixtures, P8 actual-entry close; source 앱72/72에 good32/bad5 포함 | DECISION6313329886 반영 source PASS, 최종 dist 호스트 재검증 |
|2 구독·push | agent transport, domain routing/delivery/scheduling, app inbox/subscriptions/stream, P7 client/model | I-01~05/I-09~15/I-D1, C-02, P8 두세션/HOLD/ACK/apply source79검사, B-02/03 | source의 UUIDv8 WS 영수·ready503·HOLD 재전달 PASS, 최종build/deployed browser·Monitor는 호스트 수용 |
|3 COMPACT | domain segment/packet/publication, compact HTTP, front compact/comment | U-C/U-M·I-06, P8 due/COMPACT/pointer/close, B-01-4 |25댓글/40k 경계는 P6 참조, 배포 DOM 미실행 |
|4 CLI·스킬 | apps/cli post/watch/subscribe/compact/alias/board·profiles/state | C-01/C-02/I-P1/I-S1, P8 dry-run exit0/게시0 | sandbox 교차는 CLI run() emit, 독립프로세스·once/until 호스트 재검증 |
|5 운영 | compose4서비스·local-build/COPY deploy·PG volume, React 최소 UI | O-01/I-12, P8 source readiness503/WS1001·30초 부분 PASS, B-01~03, README/docs7종 | 배포브라우저·반복deploy/충돌/SIGTERM/restore는 호스트 실행 |
|6 검증·문서·커밋 | fixture37·실DB·P8 정식 entry/browser·계획/보고/이 문서 | [P8 계획](../apps/issus/tests/plans/p8-acceptance-20261021.md), [base/s4 보고](../tests/reports/wave3-assembly/20261021_181500.md) | P8 커밋·push 금지, VERIFY 후 orch 통합·커밋·배포 |

| P8 시험 | 구현 범위 |
| --- | --- |
| B-01-1 | 배포 issue table·row·main/nav strict locator |
| B-01-2 | 본문/댓글 실제dl·term·원문 보기 |
| B-01-3 | legacy NOENV 경고·HTML 실행0 |
| B-01-4 | 강한 마커 h2·since-compact 기본·전체 토글 |
| B-02-1 | ASK→transport receipt→명시 ACK 미리보기→acked→applied·reload |
| B-02-2 | server422 reason 순서/문자열 동일·invalid 표시·게시0 |
| B-02-3 | 유효ASK 검사/게시 status·자기 canonical 댓글 reload 보존 |
| B-03-1/2 | 빈목록 status·close native dialog blocker alert |
| B-03-3 | 실제 목록 GET 지연중 loading status+aria-busy, 완료후 table1·loading0 |
| B-03-4 | WS 실패5회(최초+재접속4) 뒤 연결오류 alert1·거짓 연결상태0 |
| B-03-5 | 실제 WS단절→재연결대기→새구독연결됨, 단절중게시 replay·영수, 실제프레임중복1회 뒤 전체중복행0 |
| I-01/02/03/04/05/06/07 | actual-entry 두세션·ASK·ACK/apply·HOLD retry/escalation·COMPACT·닫기 |
| I-P1/C-01 부분 | CLI dry-run 서버 preflight·댓글수 불변 |
| O-01 부분 | ready 음성·복구, service.stop WS1001·30초 이내; SIGTERM/전체deploy와 구분 |

P5 deliveries 전용 시험은 이 담당이 수정하지 않는다. P4/P6/P7 기존 증거를 참조할 때 최초 보고와 현재 재실행을 구분한다. 미실행·알려진 실패·호스트 통과를 같은 PASS 합계에 넣지 않는다.

DECISION6313571462 후속은 design v2.3 §10 B-03 기준이다. acceptance는 WS 영수오류·세 앱 migration 누락503 실패를 필수 assert하고 HTTP 영수 fallback을 허용하지 않는다. completed=true·limitations=[]도 별도로 검사한다. 최종 호스트 명령 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser`는12/12·fail/skip/cancelled0·pageerror0·재연결중복행0, integration은issus54/54를 기대한다. Monitor 실기는 오케스트레이터의 별도 증거다.
