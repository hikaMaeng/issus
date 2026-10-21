# Test Plan: subscribe-wave3

작성: 2026-10-21, issus-1-client/s2. 기준: DECISION 6312691996, design §5.4·§5.6·§8·C-02.

목표: 제어 프레임만으로 once 종료0건, 첫 delivery 영수 뒤 exit0, until 만료3. 단절 후 새 subscription/key에 같은 scope의 영수 확정 cursor 승계. 자동 ACK/process/application0.

환경: Windows Node, 기존 workspace 의존성, 실제 Postgres/pgmq loopback15440. `ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus`. token은 시험 세션의 임시 값만 사용한다. 전용 schema/queue는 P5 harness가 생성·정리한다.

절차:
1. domain/CLI lint와 npm test. spawn EPERM은 실패 로그를 남기고 허용된 JS emit + `node --test --test-isolation=none`으로 실행한다. profile DACL 실패는 우회하지 않는다.
2. WS/SSE loopback: ready/subscribed/replay와 상태 프레임 후 계속 대기, delivery 출력→지연 영수 성공→0. delivery 없는 once/연속 대기 및 영수 중 until 만료→3. 인자 오류→2.
3. 재접속: 기존 ID 폐쇄, 새 ID/key 발급, 확정 cursor와 SSE Last-Event-ID 승계, eventId 출력 중복0. 실패 영수·출력은 cursor 불변. cursor 만료·scope 변경은 새 snapshot.
4. 실제 조립: `python apps/cli/tests/tools/subscribe-integration.py`. P5 HTTP 등록 API·실DB·PGMQ·broker·WS를 이용해 단절 전후 영수 행, subscription.closed_at, cursor와 중복0을 대조한다. 새 별칭은 과거 issue-open delivery가 없어 C-02 제어 프레임 대기를 독립 검증한다.
5. 빌드 후 `python apps/cli/tests/tools/subscribe-binary.py`: 실제 CLI 별도 프로세스+loopback SSE 계약 서버에서 영수 전 종료0건, 영수 후 exit0·idle 만료 exit3, stdout JSONL·토큰 비노출을 확인한다.

증거: 명령·cwd·exit·pass/fail 수, subscription/cursor 진단, `.cache/client-s2/*.log`. 보고: `tests/reports/subscribe-wave3/`. DOM locator는 N/A. 배포 후 Monitor 실제 깨우기와 호스트 npm 전체 검증은 오케스트레이터 담당이다.
