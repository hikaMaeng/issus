# testing

정본 계획: [cli-compatibility](../tests/plans/cli-compatibility-20261021.md). 결과는 `tests/reports/cli-compatibility/`에 시각별로 기록한다. 표준 명령은 루트의 `npm run lint --workspace @issus/cli`, `npm test --workspace @issus/cli`, `npm run build --workspace @issus/cli`, `npm test --workspace issus_domain`이다.

`src/tests`가 CLI 계약·Python37 stdout/exit·watch golden·실제 loopback WS/SSE 모의 서버·profile ACL을 검증한다. domain `src/front/model/model.test.ts`가 frame·upsert·cursor·HTTP operation을 검증한다. P5/P6 실제 API·Postgres·배포 UI 수용은 P8에서 별도 실행하며 모의 시험 통과로 주장하지 않는다.

Python 정본은 기본 사용자 스킬 경로 또는 `ISSUS_REFERENCE_SKILL`에서 읽기만 한다. `python tests/tools/generate-watch.py`는 watch Python/native 골든을 갱신하며 규약 snapshot 변경은 DECISION 뒤만 한다. 일반 npm test는 Python을 직접 실행한다.

실제 실행 파일 비교는 루트에서 `python apps/cli/tests/tools/binary-contract.py --out .cache/p7/binary-results.json`. Python 정본과 built `dist/index.js`를 별도 프로세스로 실행하고 무변경 HTTP 계약 서버에 연결한다. fixture37와 Windows 한글/공백/emoji 경로·CRLF 보충1개의 stdout hash·exit, preflight 수·mutation0을 기록한다.

샌드박스의 spawn EPERM에서는 사용자 허용 보조 경로를 쓴다. 루트에서 Python oracle을 `--out .cache/p7/python-post-results.json`으로 실행하고 `ISSUS_PYTHON_REFERENCE_RESULTS`에 절대경로를 지정한다. CLI cwd에서 `tsc -p tsconfig.json --noEmit false --rootDir src --outDir .cache/test-js`, 이어 `node --test --test-isolation=none .cache/test-js/tests/*.test.js`를 실행한다. domain 모델은 `tsc -p tests/front-model.tsconfig.json` 뒤 `.cache/front-test-js/front/model/model.test.js`를 같은 Node 옵션으로 실행한다. Windows ACL 실패를 skip하거나 파일 권한을 낮춰 우회하지 않는다.

빌드 후 `node apps/cli/dist/index.js --help`와 Windows npm shim을 확인한다. P7은 DOM을 렌더하지 않으므로 browser locator는 N/A다. P8의 semantic browser 수용을 대신하지 않는다.

wave3 C-02·재접속 계획: [subscribe-wave3](../tests/plans/subscribe-wave3-20261021.md), 실행 결과는 `tests/reports/subscribe-wave3/`. `src/tests/subscribe-wait.test.ts`는 WS/SSE의 제어·상태 알림 무종료, 첫 영수 후0, 영수 중/유휴/연속 대기 만료3과 인자 범위를 검증한다. `stream.test.ts`는 새 ID·key와 확정 cursor 승계, 출력/영수 실패, 만료 snapshot을 검증한다.

실제 PG/PGMQ+broker+HTTP+WS: `ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus`를 환경에 지정하고 루트에서 `python apps/cli/tests/tools/subscribe-integration.py`. P5의 읽기 전용 조립 fixture를 별도 JS emit에 주입하고 전용 schema/queue를 끝에 제거한다. CLI 런타임은 이 fixture를 import하지 않는다. 실제 C-02와 단절 후 새 구독·영수·cursor·중복0·자동 ACK/process0을 검사한다. fixture 등록 API를 사용하는 시험이며 직접 DB seed 우회는 쓰지 않는다.

빌드된 CLI의 실제 process exit·JSONL은 `python apps/cli/tests/tools/subscribe-binary.py`로 확인한다. 별도 프로세스+loopback SSE 계약 서버로 제어 프레임과 영수 응답 대기 중 종료0건, 영수 후 exit0·유휴 만료 exit3을 검증한다. 실DB 시험과 구분하며 cursor/journal 증거만 CLI `.cache/subscribe-binary-*`에 남긴다.
