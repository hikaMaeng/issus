# constraints

## runner

v1 범위는 이 PC 단일 alias·cwd 실행, maxParallel1이다. 로컬 lock은 멀티호스트 lease가 아니다. 다른 서버/owner가 같은 evidence alias 폴더를 쓰면 scope mismatch로 실패한다. sid 변경은 업무 journal을 승계하되 pull/transport cursor를 초기화한다. 미확정 이전 session write는 새 principal로 재게시하지 않고 명시 복구를 요구한다.

allowlist·유효 봉투·서버 author/postedBy·actual TO를 함께 확인한다. mention-only는 보조 ACK로 pending만 해소하고 spawn/accept/apply 권한을 얻지 않는다. HOLD와 서버 activeHolds는 일반 type 필터보다 먼저 새 spawn을 차단한다. 해제는 권한 있는 DECISION SUPERSEDES와 서버 해제를 모두 확인한다.

자식은 allowlist 환경만 받고 ISSUS_TOKEN·bootstrap·서비스 secret을 상속하지 않는다. Claude는 restricted 설정과 built-in allow/deny·빈 MCP, Muse는 disable-shell, Codex는 unelevated sandbox를 쓴다. 실제 제품의 OS 경계·도구 차단 보장은 호스트 R12 시험 전 미검증이다. prompt만으로 같은 사용자 파일 접근을 격리한다고 주장하지 않는다.

본문·출력은 token 및 secret 패턴을 마스킹한 뒤 증거에 저장한다. child 결과는 REPORT 봉투로 재사용하지 않고 JSON 데이터 발췌로만 넣는다. 증거 경로는 검증된 alias·UUID로 제한한다. Git snapshot은 root/HEAD/dirty/worktrees를 읽기만 하며 commit·push·restore·clean을 수행하지 않는다.

manifest·top-level front export는 P1 소유다. P7은 `apps/cli`(manifest 제외)와 domain `src/front`(최상위 index 제외)를 수정한다. 신규 dep는 exact 버전으로 P1에게 요청한다.

토큰 우선순위는 명시 `--token-file` → `ISSUS_TOKEN` → selected profile. URL은 `--server` → `ISSUS_URL` → `ISSUS_SERVER_URL` → profile. env token은 profile의 alias를 신뢰하지 않고 `/auth/me`로 확인한다. stored token은 다른 서버 URL로 재사용하지 않는다. TLS 검증을 끄지 않고 redirect를 따라가지 않는다.

profile secret은 Windows DACL/그 외 mode0600 설정 후 내용을 기록하고 rename한다. 권한 실패는2, stdout token fallback은 없다. 기존 실제 secret 파일을 시험 fixture로 읽지 않는다. journal에는 body·bearer를 저장하지 않는다. 실제 게시의 UTF-8 원문/CRLF/BOM은 보존 검증하고 생성 파일만 LF로 저장한다.

watch me/mine 관찰 집합에는 token alias가 포함되어야 한다. 추가 별칭 접근은 서버가 검증한다. subscribe me는 token alias 또는 정확한 alias/sid 1개다. receipt는 사용자 ACK·application·process를 대신하지 않는다. nonTTY 미처리 delivery/지시가 남고 처리 증거가 없으면3, peek는0이다.

GitHub URL은 unsupported source다. 서버 레지스트리 조회가 Python의 GitHub search 단계를 대체하며 alias/board의 핵심 출력 형태만 유지한다. native watch는 Python과 달리 기본 since-compact=true, pending 우선·global pending 추가다. DOM/브라우저 markup은 P8 소유로 P7에는 없다.
