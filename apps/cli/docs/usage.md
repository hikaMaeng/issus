# usage

빌드: domain build 후 `npm run build --workspace @issus/cli`. 실행: `node apps/cli/dist/index.js` 또는 설치된 `issus`. `npm install -g ./apps/cli`/workspace 설치·Windows shim 갱신은 호스트에서 수행한다. 스킬 원본은 수정하지 않고 호출 명령만 아래처럼 바꾼다. GitHub로 미러하지 않으므로 대상 repo/issue가 issus 서버에 있어야 한다.

| 기존 호출 | 대체 |
| --- | --- |
| `python scripts/issue_post.py --repo o/r --issue N --body-file F` | `issus post --repo o/r --issue N --body-file F` |
| 위 명령 `--edit-body` / `--dry-run` | 같은 옵션, dry-run도 서버 preflight·인증 필요 |
| `python scripts/issue_watch.py --repo o/r --me A ISSUE...` | `issus watch --repo o/r --me A ISSUE...` |
| watch `--mine TEXT --state FILE --limit N --full --peek --since-compact --compact-due --board ISSUE` | 같은 옵션, me/mine/board만 반복 가능 |
| watch `--show ID` | `issus watch --repo o/r --show ID` |
| `python scripts/compact_prepare.py --repo o/r --issue N [--out F]` | `issus compact [prepare] --repo o/r --issue N [--out F]` |
| `python scripts/alias_check.py --owner O ALIAS [--deep] [--repos LIST] [--limit N]` | `issus alias [check] --owner O ALIAS [--deep] [--repos LIST] [--limit N]` |
| `python scripts/board_find.py --repo o/r [--issue N] [--user-board N]` | `issus board [find] --repo o/r [--issue N] [--user-board N]` |

`post --repo --issue --body-file`는 필수·비반복이다. `--timeout 60s` 기본, ms/s/m 양수 허용. COMPACT는 `--packet-file packet.md --sampled 1000001,1000002 --compacted-by ALIAS`도 필수이며 packet.md.meta.json의 token을 전달한다. DECISION/HANDOFF 요약 생략 사유는 `--compact-deferred-reason TEXT`다.

watch ISSUE는 N/owner/repo#N/서비스 issue URL이다. 숫자·show는 repo 필수. me가 없으면 token alias, 명시 me는 lower/dedupe하며 slash/sid를 제거하지 않는다. mine은 정본처럼 작성:·역할·sid를 제거한다. board는 본문 BOARD와 합집합이다. state 기본 cwd `issue_watch.state.json`, limit4000 codepoints, page-size100(1–500), full/peek/compact-due 기본false. since-compact는 기본true이고 `--all-history`로 끈다(둘 동시 지정2). processed-file은 `[{"deliveryIds":["<uuid>"],"disposition":"replied","evidenceCommentId":"1000001"}]` JSON이며 peek와 동시 지정 불가다.

compact out 생략시 cwd `compact_packet_<owner>_<repo>_<n>_<last-id>.md`, 옆에 `.meta.json`을 저장한다. alias repos는 comma split/빈 값 제거/dedupe, limit60 기본이며 owner registry 충돌 검사는 축소하지 않는다. board ensure는 `--repo o/r --owner ALIAS [--body-file F]`로 명시한다.

구독: `issus subscribe --repo o/r --issue N [--me alias/sid] [--transport ws|sse] [--board N ...] [--cursor FILE] [--once] [--until <ms>]`. repo/issue는 필수·비반복, transport 기본ws, once=false, since-compact=true. until은 비반복 양수 정수 밀리초(1–2147483647)이며 생략하면 대기 상한이 없다. cursor 기본 profile 디렉터리의 scope별 stream-cursors.json. stdout은 항상 JSONL이며 구독을 만들 때마다 `{subscription:...}`, 후속 줄은 P3 server frame이다. receipt는 자동, 업무 ACK는 post로 별도 작성한다.

`--once`는 ready/subscribed/replay 완료와 일반 상태 알림을 지나 첫 queued/redelivered/escalated delivery의 출력·HTTP 영수·cursor 저장이 성공한 뒤 exit0이다. `--until 60000`은 연결·재접속·영수 대기를 포함한 60초 상한이며 만료 exit3이다. once와 함께 쓸 수 있고, once가 없으면 delivery 뒤에도 대기하다 상한에서3이다. 종료 때 현재 구독만 닫고 마지막 확정 cursor를 보존한다(정리 요청 상한5초).

백그라운드 깨우기 예: `issus subscribe --repo o/r --issue N --once --until 60000`의 stdout JSONL과 종료 알림을 후속 세션에 넘긴다. exit0은 transport 영수이며 업무 ACK·반영을 뜻하지 않는다. Codex 래퍼의 후속 실행이 필요한 ACK/반영을 별도로 작성한다. Monitor 실제 세션 깨우기는 배포 후 오케스트레이터 실기 확인 대상이다.

단절·재실행에서는 새 subscription ID/key를 발급한다. 같은 scope/channel 집합이면 마지막 영수 확정 cursor를 새 구독에 넘기고 eventId 중복 출력을 막는다. scope 불일치·만료 cursor는 새 snapshot부터 읽는다. 저장된 subscription ID는 연결 재사용에 쓰지 않는다.

인증: `ISSUS_URL`·`ISSUS_TOKEN` env 또는 `issus auth set --server URL --token-stdin`(redirected stdin). `--profile NAME --profiles-file FILE`로 profile을 고른다. 기본은 `~/.config/issus/profiles.json`, `ISSUS_CONFIG_DIR`·`ISSUS_PROFILES_FILE`로 변경 가능. `--token-file FILE`은 명시 파일에서만 읽는다. 토큰을 인자나 로그로 전달하지 않는다.

세션: bootstrap 인증으로 `issus session open --alias ALIAS --sid s1`. 응답 token을 profile에 저장하고 stdout에는 식별자·만료만 출력한다. 응답 유실시 같은 명령/key로 확인 → SESSION_TOKEN_NOT_REPLAYABLE의 sessionId 확보 → bootstrap token으로 `--sid s2 --reissue-of ID`를 명시한다. 새 sid/key 재발급은 이전 token을 revoke한다. env token이 profile보다 우선하므로 발급 뒤 ISSUS_TOKEN은 해당 세션으로 전환한다.

나머지 명령: `issue open --repo --title --body-file`, `issue get|body|close|reopen --repo --issue`(body/close/reopen은 revision 필수), `handoff accept|complete --repo --issue --id`(ack-comment-id 또는 revision 필수), `admin repo --owner --slug --project-code [--auto-board --board-owner]`. `issus --help`에 명령별 입력이 있다. 모든 비반복 옵션 중복·필수 누락은2다.
