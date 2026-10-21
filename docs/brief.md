# issus — 에이전트 통신용 이슈 서비스 (과제 원문 요약, 2026-10-21)

GitHub 이슈와 흡사한 기능(저장소·이슈·댓글·본문·닫기·이관)을 제공하되, 핵심은 **Claude Code·Codex 세션이 구독(subscribe)하면 이벤트가 수신자에게 push되는 구조**다. 지금의 스킬 `issue-board-collab`은 "글 쓰는 규칙"만 주지만, 이 서비스는 그 규칙(봉투·라우팅·ACK·COMPACT·공통 게시판)을 **처음부터 기능으로** 제공한다.

## 기반

- `F:\dev\ndx_business` — `packages/agent`(이벤트소싱 브로커 라이브러리: PGMQ 명령 큐, append-only `event_store`, 로그 tail → WebSocket 허브, 커서 재생, 반응표 `ReactionTable`, 워커 서버 틀)와 `apps/vibeagent`(그 라이브러리로 만든 스트리밍 서버; 워커는 이벤트별로 즉시 반환). 재사용할 것(라이브러리·패턴·compose 구조)과 새로 만들 것을 구분한다. 원본은 수정하지 않는다(workspace 패키지로 가져오거나 Verdaccio 확인 후 vendoring).
- 통신 규약 정본 `C:\Users\hika0\.claude\skills\issue-board-collab`(동일본 `S:\skills\issue-board-collab`): `references/envelope.md`(봉투 v2), `types.md`(TYPE 13), `body.md`(이슈 본문 첫 줄), `reading.md`(우선 수신·PENDING-ACK·커서), `delivery.md`, `compact.md`(강한 마커, 25댓글/40k자), `board.md`, `join-naming.md`(별칭 `<proj>-<n>-<role>`, `/sid`), `examples/`(정형 32·나쁜 예 5·흐름 9), `scripts/*.py`(issue_post 검사 규칙 = 서버 측 검증 사양). 이 규약을 서비스의 1급 모델·API·검증으로 승격한다.

## 요구

1. **도메인:** 저장소(프로젝트) → 이슈(본문 봉투·STATE enum·OWNER·BOARD·COMPACT 포인터) → 댓글(봉투 필수, 서버가 issue_post와 같은 검사로 거부). 별칭 레지스트리(소유자 전체 유일, `alias_check` 규칙 내장, 세션 `/sid`). 이슈 닫기·이관(HANDOFF ACK 후), 공통 게시판(저장소당 1개, 자동 생성 옵션).
2. **구독·push:** 세션이 별칭으로 구독하면 자기 `TO:`·`CC:`·`TO:ALL`·지시성 TYPE·OWNER 이슈의 COMPACT를 받는다. 전달 상태를 서버가 추적: 게시됨→전달됨→수신 확인(ACK)→반영. ACK-BY 경과 시 재전달·에스컬레이션 이벤트. 수신 방법 최소 둘: (a) 스트리밍(SSE/WebSocket, 이벤트소싱 서버 재사용), (b) 받은편지함 pull API(상주 세션 없는 Codex용, 커서 기반·COMPACT 이후만). Claude Code 세션을 깨우는 훅(RemoteTrigger 등)은 어댑터로 분리해 선택 사항으로.
3. **COMPACT:** 서버가 구간 통계(댓글 수·자수)로 `compact-due` 이벤트를 OWNER에 보내고, 패킷(이전 COMPACT+이후 댓글, 비밀 마스킹)을 API로 제공. COMPACT 댓글은 강한 마커 검사. 읽기 API는 "최신 COMPACT 이후"를 기본 지원.
4. **CLI·스킬 연동:** `issus` CLI(post/watch/subscribe/compact/alias/board)가 기존 스킬 스크립트와 같은 옵션 모양을 유지해 `scripts/*.py`를 대체할 수 있게. GitHub ↔ issus 양방향 미러는 비범위(후속).
5. **운영:** 루트 `docker-compose.yml` 하나, `npm run deploy`로 로컬 빌드·compose 재기동. 자료는 Postgres 이벤트 스트림에 영속. 헤드리스 브라우저용 최소 UI(이슈 목록·댓글·봉투 표시, `[NOENV]`·COMPACT 마커 강조)는 semantic markup.
6. **검증:** 이벤트소싱 단위 시험 + 통합 시험(두 가짜 세션이 구독 → ASK → ACK → HOLD 재전달 → COMPACT-due → 닫기) + 스킬 `examples/*.md` 32개 전부 서버 검증 통과·`bad/` 5개 거부 + 헤드리스 브라우저 시험·보고서(tests/plans, tests/reports). 문서(README, docs/architecture, API, 운영)와 함께 커밋.

## 진행 방식

- 설계안 `docs/design.md`(도메인·이벤트 목록·API·구독 모델·재사용 범위) → Codex 리뷰(gpt-6.1-sol high) 2회 반영 → 구현. 구현도 단계마다 Codex 리뷰.
- 오케스트레이터(Claude Fable 5.1)는 지시·판정만. 제작은 Codex gpt-6.1-sol(대부분)·Sonnet 5.5 서브에이전트.
- 통신 채널은 이 저장소(hikaMaeng/issus)의 이슈 게시판, 규약은 `issue-board-collab`.
- 모노레포·compose·문서·시험 형식은 전역 스킬(monorepo-architecture-guard, docker-compose-module-design, package-docs-writer, test-plan-and-report, headless-browser-markup)을 따른다.
- 완료 기준: 문서·`npm run deploy`·Docker·헤드리스 검증·시험 보고서·커밋.
