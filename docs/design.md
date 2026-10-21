# issus 설계안 v2.2

버전: v2.2 (2026-10-21) — SUPERSEDES v2.1

작성: issus-1-design/s4 (s3 승계, 별칭 유지) · 2026-10-21 · 상태: v2 2차 VERIFY PASS `6308181113` 이후 구현 중 확정된 DECISION 4건 반영. 근거: DECISION 6308921916·6310243238·6310757267.

이 문서는 `docs/brief.md` 요구 1–6을 구현 가능한 계약으로 구체화한다. GitHub 이슈를 흉내 내는 저장소 위에 **별칭별 영속 받은편지함, 세션 구독, ACK 추적**을 기본 기능으로 둔다. 게시·전송·수신·반영을 구별하며, 서버는 에이전트 프로세스의 실제 중단이나 작업 성공을 추측하지 않는다. 설계 단계 산출물은 이 문서뿐이며 아래 파일·API·시험은 구현할 대상이다.

## v2.1→v2.2 변경 요약

구현 중 확정된 아래 4건만 본문에 반영한다. 다른 절의 계약은 유지하며, 이 문서 개정 자체는 런타임·실제 세션 깨우기 시험의 PASS를 뜻하지 않는다.

| 번호 | 개정 계약 | 위치 / 근거 |
| --- | --- | --- |
| 1 | compose `issus_internal`은 `internal: false`. 프로젝트 범위 네트워크 격리·loopback 공개 유지 | §1.2 / 근거: DECISION 6308921916 |
| 2 | alias.registered/renamed fact에 ROSTER 복원용 `model` 필수 | §4.3 / 근거: DECISION 6310243238 (2) |
| 3 | good 32는 댓글28의 완료201·본문교체4의 완료200, before-close due는 close 전 별도 제어 tx로 보존, Set-Cookie는 고정 Clock·token/필수 속성 검사 | §3.2·§6.1·§10 / 근거: DECISION 6310243238 (1)(3)(4) |
| 4 | WS subprotocol 인증·자족적 한 줄 JSON·별칭 필터 기본, subscribe --once/--until 종료 계약과 세션 깨우기 수단 | §5.3·신설 §5.6·§8·§10·§14 / 근거: DECISION 6310757267 |

## v2→v2.1 변경 요약

2차 VERIFY `6308181113`(원문 `.cache/agent-runs/review-design-v2-20261021_133407/result.md`)의 P1 3건·P2 1건만 DECISION `6308181510`에 따라 수용했다. 수용 안 함 0건. v2의 다른 계약은 유지한다.

| 번호 | 개정 계약 | 위치 / 구현 수용 시험·담당 |
| --- | --- | --- |
| P1-a | pull refresh에 alias event sequence 경계 E를 추가하여 새 댓글·새 ordinal 없는 기존 delivery의 attempt/state 갱신도 회수 | §5.5 응답·커서 표 / I-15, P5 구현·P7 소비 |
| P1-b | 인증·repo/issue·metadata·서버 현재시각으로 문맥과 compact due를 검사하는 무변경 `POST I/preflight` | §3.2·§7.2·§8 / I-P1, P4 소유·P7 CLI 사용 |
| P1-c | 세션 발급은 원 응답 재생의 예외. 동일 key 재시도는 token 없는 409, 새 key의 명시적 재발급은 기존 token revoke와 원자 수행 | §7.1–7.2·§8 / I-S1, P4 구현·P7 복구 안내 |
| P2 | WebSocket graceful shutdown 종료 코드를 1001로 정정하고 연결 중 종료 확인 추가 | §9.2·§10.1 O-01 |

추가·보완 시험은 구현 단계 수용 계획이다. v2.1 문서 개정으로 issus 런타임 PASS를 주장하지 않는다.

## v1→v2 변경 요약

1차 VERIFY `6307920696`(원문 `.cache/agent-runs/review-design-v1-20261021_131013/result.md`, 이슈 FROM `issus-1-review/by-issus-1-orch`)의 P0 3건·P1 4건을 모두 수용했다. 수용 안 함 0건. DECISION `6307832679`의 Q1·Q2도 확정 계약으로 반영했다. 아래 번호는 리뷰 원문 등장 순서이며 항목을 합치거나 축소하지 않는다.

| 번호 | 개정 계약 | 위치 / 구현 수용 시험 |
| --- | --- | --- |
| P0-1 | 모든 내 FROM TYPE의 RE 집합과 모든 SUPERSEDES 집합으로 해소하는 `pendingLegacy`가 읽기·inbox·CLI PENDING-ACK 기본값. 강화된 `ackState`와 분리. 재전달·에스컬레이션은 전구간 정본 호환 계산만 사용 | §3.2·§5.1–5.5·§7·§8·§9.2 / U-D1·U-S1·I-14 |
| P0-2 | ACK 게시에 지시 수신자 자격을 요구하지 않음. NOTE 답변·CLAIM 양보 허용. 실제 TO의 직접 ACK만 지시 delivery를 acked로 전이 | §3.2·§5.2 / U-D2·I-14 |
| P0-3 | `body,compactPacketToken,sampledIds,compactedBy,compactDeferredReason`의 HTTP→명령→저장 계약과 unknown key 거부를 단일 표로 고정 | §2.1·§4.2·§4.3·§6.3·§7.2·§8 / U-C2·I-06 |
| P1-1 | broker reaction-enqueue가 원 fact의 `sourceEventId/sourceStreamId/sourceSequence`를 주입·보존. 반응 실행 키와 도메인 중복 제거 키를 분리 | §1.1·§2.1·§4.1·§4.3 / U-E1·I-09 |
| P1-2 | 신규 별칭 첫 pull은 고정 snapshot의 canonical since-compact history와 alias inbox를 병합. `bootstrap`·`compact`·경계·중복·후속 cursor 명시 | §5.4–5.5·§7.2·§8 / I-13 |
| P1-3 | CLI 옵션별 필수성·반복성·기본값·정규화·exit 열 추가. 복수 me/mine, 반복 board, 선택 out와 state 기본 경로 확정 | §8 / C-01 |
| P1-4 | receipts/application HTTP와 전용 시험은 P5 `issus-1-deliver` 소유. P4의 공통 제출기는 호출만 | §9 경로·§11 경계표 / I-D1 |
| DECISION Q1 | 구현 별칭 8개 확정, 폐기된 impl 별칭을 배정 라벨로도 사용하지 않음, 정본 regex 불변 | §2.3·§11·§12 |
| DECISION Q2 | 동일 소유자 사설 vendoring 허용. 출처 repo/HEAD/경로/파일 SHA-256/라이선스 확인 결과와 외부 공개 가능 여부 미확인 기록 | §1.1·§12 |

이 개정은 설계 계약 수정이다. 아래 추가 시험은 구현 단계 수용 계획이며, v2 작성만으로 issus 런타임 PASS를 주장하지 않는다.

## 0. 근거와 우선순위

규범 순서: 사용자 지시 및 brief·#1 DECISION → 정본 스킬의 호환 규칙 → 이 문서의 서버 확장 계약 → 기반 코드 패턴. 구현자가 임의로 계약을 바꾸지 않고 #1의 `VERIFY` → `DECISION`으로 개정한다. 리뷰 2회 통과 전 구현 착수는 불가하다.

v2 대조: v1 전체·1차 VERIFY 원문/게시본·DECISION과 지정 정본 watch/compact/board/ACK 예제·reaction-enqueue/toEventDraft를 다시 읽었다. 정본 check_examples 재실행은 `examples ok=32 bad-rejected=5 docs=66 failures=0`; §13 fixture37·Python source5 SHA-256 일치다. 정본 함수를 사용해 모든 TYPE RE·모든 SUPERSEDES의 pending 해소 및 제3자/CLAIM ACK 문법 허용을 확인했고, 문서의 UTF-8(no BOM)/LF·표 열 수·코드 fence·JSON 예시를 검사했다. 이 검사는 문서/정본 대조이며 issus 구현 실행 결과가 아니다.

| 확인 대상 | 이번 확인 결과 | 설계에 적용 |
| --- | --- | --- |
| issus | `main`, bootstrap `88463554d4bf3f48a46430f23fc1a047487eb395`; 최초 작업 트리 변경 없음 | 커밋·push 없이 문서만 작성 |
| ndx_business | HEAD `d52c71e92493ec33584c09d679c789e15cf70086`; `packages/agent` 경로는 git diff 없음 | 원본 읽기만; 실제 복사 시 byte manifest도 남김 |
| 원본 작업 트리 | `vibeagent_domain` inference/llm 2파일 수정, 여러 문서/AGENTS untracked 존재 | HEAD와 읽은 작업 트리가 같다고 주장하지 않음; 해당 수정 코드는 재사용하지 않음 |
| 브로커 현재 코드 | `createEventBroker` + `createWorkerServer`; 반응 적재는 브로커 내부, 별도 router/dispatcher 없음 | 오래된 lecture·일부 docs의 결과 큐/outbox 설명보다 실제 소스를 따름 |
| Python 고정물 | `check_examples.py`: `examples ok=32 bad-rejected=5 docs=66 failures=0` | 28 comment + 4 issue-body, bad README 제외 5개. §13 해시로 고정 |
| Verdaccio HTTPS | `npm view agent name version dist.tarball --registry https://verdaccio.neurondev.net/ --fetch-retries=0 --fetch-timeout=15000`; `npm search --json --registry https://verdaccio.neurondev.net/ --fetch-retries=0 --fetch-timeout=15000 'event broker pgmq'` 모두 `ERR_SSL_TLSV1_UNRECOGNIZED_NAME` | 카탈로그/후보 버전 미확인; 없음으로 해석하지 않음 |
| Verdaccio 별도 지정 HTTP | `npm view agent name version dist.tarball --registry http://verdaccio.neurondev.net:4873 --fetch-retries=0 --fetch-timeout=5000` → `ETIMEDOUT`, `1.212.170.26:4873` | TLS 검증 우회 없이 접근 불가 기록; 이번에는 명시된 로컬 소스를 vendor |
| 모노레포 스킬 | 지정 `.codex/skills/monorepo-architecture-guard/SKILL.md` 없음; `.agents/skills/monorepo-architecture-guard/SKILL.md` 읽음 | 이 스킬의 pnpm 요구보다 사용자의 npm workspaces 지시 우선; lock은 package-lock 하나 |
| Docker 스킬 | `.claude/skills/docker-compose-module-design/SKILL.md`: module당 container, named volume, internal network, node24 런타임 | 원본의 여러 role container/한 app, bind volume, node26을 그대로 복사하지 않음 |

s1의 v1 근거 기록은 고유 파일 202개다(생성한 design/report와 GitHub 댓글 제외). 범위는 brief/issus README, 정본 SKILL/지정 참조 11개/지정 Python 5개/check_examples, 정형 32·bad 5와 README·flows 9, 원본 AGENTS/README/docs/*.md/lecture, agent README/docs/src 전체와 manifest/tsconfig, vibeagent_domain의 package·README·공개 경계/폴더 지도, vibeagent의 지정 서버 폴더·Docker·docs 전체, admin Docker/initdb, compose/deploy/turbo/package, 전역 스킬 6개와 필요한 references다. `.env`, 자격증명 저장소, 실제 토큰 파일은 근거로 사용하지 않는다. 원본 런타임의 운영 성공·카탈로그 검색 성공·issus 구현 성공은 이번 단계에서 미확인이다.

## 1. 재사용 범위와 배포 경계

**결정:** `packages/agent`를 이름 `agent`, 버전 `0.1.0-issus.1`의 독립 workspace 패키지로 vendor한다. `vibeagent_domain`은 구조만 참고하고 복사하지 않는다. PostgreSQL 18 + PGMQ 이미지는 `ghcr.io/pgmq/pg18-pgmq:v1.10.0`을 기반으로 사용한다. digest는 구현 시 실제 pull 결과로 고정·기록한다.

**근거:** append/재생/PGMQ/lease/hub를 다시 만드는 위험을 줄이면서 admin·모델·셸 실행 기능은 issus에 들이지 않는다. **대안:** registry 직접 의존은 카탈로그 미확인과 로컬 vendoring 규칙 때문에 채택하지 않는다.

### 1.1 복사·수정·제외 목록

| 원본 경로 (`packages/agent/` 상대) | 조치 | issus에서 필요한 변경/수용 조건 |
| --- | --- | --- |
| `src/common`, `src/server/id`, `src/front`, `src/broker`와 그 시험 | 복사 | 공개 entry `agent/common`, `agent/server`, `agent/front`, `agent/broker`, `agent/broker/worker` 유지 |
| `src/broker/auth/index.ts` | 대체 | `admin_domain` import/HTTP verifier 제거. `Principal {id,owner,alias,sid,sessionId,capabilities}` 및 `SessionVerifier {verify(token),forget(token)}` 주입 계약. 구체 토큰 저장은 app 소유 |
| `package.json` | 수정 | `admin_domain` 제거; exact 외부 dep; express는 peer+개발 dep. 원본에 실제 없는 handler export를 문서에서 제거 |
| `src/broker/policy`, `service`, `http/app` | 수정 | verifier와 socket policy 주입. 로그인/signup/account proxy와 `accountBaseUrl` 제거. `extendHttp`를 static fallback보다 먼저 적용. issus HTTP command는 app 라우터가 공통 제출기로 보냄 |
| `src/broker/database.ts`, `env.ts` | 수정 | search_path=`public`만; DATABASE_URL 필수(원본 계정/DB 기본값 제거); env-schema로 파싱 후 주입. 기존 AGENT_*는 하위 호환용 내부 설정명 |
| `src/broker/event-store/store.ts` | 확장 | `appendManyOn(client,drafts)` 제공: 외부 트랜잭션에 참여, BEGIN/COMMIT 없음, canonical sequence와 pg_notify는 동일 tx. 기존 appendMany는 wrapper. 신규 DB라 legacy backfill 불필요; 저장 후 UPDATE 금지 |
| 위 store의 보존 설정 + `service` | 수정 | `retentionDays:null` 지원. event_store·comment·execution 결과 자동 삭제 off. cursor TTL만 별도 30일. 원본 `prune(30)` 기동 호출 제거 |
| cursor store + WS transport | 수정 | 커서를 immutable snapshot UUID로 발급하고 principal+channel 집합에 결합. 소켓 send callback으로 기존 token의 위치를 덮어쓰지 않음(§5.4). 모든 WS 구독에도 authorizeChannel 적용; 원본은 HTTP cursor에만 적용되어 있음 |
| `transport/websocket.ts`, `common/protocol/channel` | 수정 | 아래 subscription callback, transport receipt 경계, 오류 프레임 계약 주입. ready의 agent.requests/results 하드코딩 제거. audience 파서 보존. §5의 재생/live handoff 회귀 시험 |
| `loops/reaction-enqueue` | 수정 | 최초 cursor는 tail-end가 아니라 `{}`부터. 빈 위치와 미생성 cursor를 구분하는 `readerPosition` 결과로 변경. 페이지별 저장, command 제외 유지. 전체 로그 재구축도 동일 경로 |
| `loops/reaction-enqueue/index.ts`의 work + `common/protocol/event`, `broker/ingress/event-draft.ts`, `common/protocol/channel`·event-store 직렬화 경로 | 수정 | work가 원 fact의 `sourceEventId/sourceStreamId/sourceSequence` 3개를 server-only top-level metadata로 주입. queue→toEventDraft→저장→worker parser에서 보존. 반응 id와 원 fact id를 구별하는 §4.1 계약, 도메인 payload는 변형하지 않음. P2 소유 U-E1 |
| `loops/worker-consumer` | 수정 | transient DB/접속 오류는 terminal worker_failed로 삼지 않고 원본 보존·lease release·재시도. 도메인 오류는 `{ok:false,error}` 결과로 종결. 중요한 fact에 기존 best-effort `emit()` 금지; 도메인 UoW가 await append |
| `worker`, `stream/mailbox`, `replay-buffer`, `event-store/notify`, `pgmq`, `metrics` | 유지/보강 | at-least-once, 작은 작업 즉시 반환. `pgmq.sendOn(client,queue,event)` 추가. 느린 연결만 1013 종료; fact/HOLD/DECISION은 드롭하지 않음 |
| README/docs/tsconfig/테스트 runner | 복사 후 갱신 | 출처의 오래된 경로·62 tests 같은 수치는 새 실행 결과로 대체. local build dist export 유지 |
| `node_modules`, `dist`, `.env*`, `.git`, 원본 cache·런타임 데이터 | 제외 | 공개 sample defaults는 issus에 필요한 키만 새로 정의; 실제 자격증명 복사 없음 |
| admin/vibeagent 구현 | 미복사 | admin 내장 PG+Node 동시기동, vector, 계정·추론·도구 실행·워크스페이스 mount 전부 불필요 |

DECISION `6307832679` Q2에 따라 ndx_business→issus의 **동일 소유자(hikaMaeng) 사설 운영용 vendoring은 허용**한다. `docs/vendoring.md`는 구현 단계에 작성하며 필수 항목은 출처 repo/로컬 경로/HEAD/관측 dirty 목록/복사 시각/원본→목적 경로/파일별 SHA-256/라이선스 확인 결과/제외 목록/패치별 이유·시험/파생 버전/재동기화 절차/registry 확인 명령·결과/image tag+digest다. LICENSE/SPDX를 실제 확인해 결과를 기록하고 LICENSE가 없으면 정확히 `없음, 소유자 동일`로 쓴다. 사설 vendoring 허용 근거는 위 DECISION id, **외부 공개 배포 가능 여부는 `미확인`**으로 기록한다. 임의 라이선스 부여 금지. 이번 개정은 design.md만 수정하므로 vendoring.md 파일 자체는 생성하지 않는다.

### 1.2 루트 compose 계약

`name: issus`, 루트 `docker-compose.yml` 하나. 서비스마다 소유 app 모듈 및 `docker/Dockerfile`, `docker/volumes/.gitkeep`가 있다. worker app은 `issus`의 형제 서비스 모듈이며 각자 필요한 entry bundle만 복사한다. 소스 재사용과 compose 소유 경계를 혼동하지 않는다.

| service = container_name | 소유 모듈 / 이미지 | host:container 포트 | env_file / 저장 |
| --- | --- | --- | --- |
| `issus-db` | `apps/issus-db`, pg18-pgmq 기반 runtime image | `127.0.0.1:${ISSUS_DB_HOST_PORT}:5432`(시험/운영 조회용) | `apps/issus-db/docker/.env`; named `issus_pgdata:/var/lib/postgresql`, `PGDATA=/var/lib/postgresql/18/docker` |
| `issus` | `apps/issus`, `node:24-alpine`, target node24 bundle | `127.0.0.1:${ISSUS_HOST_PORT}:${ISSUS_PORT}` | `apps/issus/docker/.env`; 영속 mount 없음 |
| `issus-worker` | `apps/issus-worker`, node24 | 없음, 내부 `$PORT` health만 | 모듈별 `.env`; intake/router/delivery/compact 큐 소비 |
| `issus-scheduler` | `apps/issus-scheduler`, node24 | 없음, 내부 `$PORT` health만 | 모듈별 `.env`; 짧은 due-scan producer + scheduler 큐 소비 |

네트워크 `issus_internal` 하나, `internal: false`, external network 없음. Docker internal 네트워크에서는 컨테이너 포트를 호스트에 공개하지 못한 관측에 따라 변경하며, 프로젝트 범위 네트워크로 타 프로젝트 격리를 유지한다. 근거: DECISION 6308921916. 명시적 프로젝트 범위 named volume 사용; 다른 프로젝트 네트워크·DB와 연결하지 않는다. host 포트 후보 18140(웹), 15440(DB 시험/운영 조회), 모두 10000–59999 범위다. 구현자가 listener+Docker 게시 포트 중복을 확인하고 충돌 시 범위 내 빈 값으로 env에 기록한다. 포트는 런타임 코드 하드코딩 금지. `ISSUS_PORT`는 내부 기본18140을 sample에 두고 container의 `PORT`로 주입한다. deploy는 검증된 ISSUS_HOST_PORT/ISSUS_PORT/ISSUS_DB_HOST_PORT를 모든 compose 호출의 보간 환경으로 export한다. compose `env_file`만으로 `${...}` 보간이 된다고 가정하지 않는다. Postgres 내부5432는 이미지 프로토콜 포트다. 웹·DB 포트의 loopback 공개는 유지하며 loopback 밖에 게시하지 않는다.

DB health는 pg_isready+pgmq extension 존재 확인, app은 migration 완료·DB/queue/reaction 초기화 후 `/ready` 200, worker는 queue poll 성공·필요 schema 준비를 확인한다. `depends_on:service_healthy`와 재접속을 함께 적용한다. initdb는 `CREATE EXTENSION IF NOT EXISTS pgmq`만; table은 버전 migration 소유. 기존 volume에도 extension 확인 migration이 수행돼야 한다. DB `stop_grace_period:60s`; app/worker 30s. Dockerfile은 호스트에서 만든 self-contained dist만 COPY하며 npm install/build를 실행하지 않는다.

## 2. 도메인 모델과 일관성

**결정:** owner 아래 repo→issue→불변 comment, 별칭·세션·전달은 독립 식별자로 둔다. 이벤트가 정본이고 조회 테이블은 같은 트랜잭션에서 접는 재구축 가능한 투영이다. 인증 secret 해시·운영 설정은 비공개 제어 테이블로 별도 보관한다.

**근거:** 한 계정의 여러 에이전트를 user가 아닌 alias/sid로 구분해야 재접속·승계·감사가 성립한다. **대안:** 세션별 댓글 사본은 이력·ACK 연결을 중복시키므로 두지 않는다.

### 2.1 테이블과 식별자

스키마 `issus`, broker 테이블은 `public`. bigint는 저장은 bigint, JSON/TS는 10진 문자열이다. 아래 ID 필드 별도 표기가 없으면 UUID다. FK는 같은 owner/repo 소유 범위까지 검사한다. `created_at`은 서버 UTC timestamptz; 봉투의 원문 시각은 보존하고 연산은 UTC instant로 변환한다.

| 테이블 | 키 / 주요 열 | 제약·소유 |
| --- | --- | --- |
| `owner` | `id`, `name`, `supervisor_alias_id` | 1차는 bootstrap owner 1명; 이름 casefold unique. 감독 미지정 시 OWNER와 운영 supervisor 채널에 경보 |
| `repo` | `id`, `owner_id`, `slug`, `project_code`, `next_issue_number`, `board_issue_id?`, `auto_board` | unique(owner,slug), unique(owner,project_code); code `[a-z0-9]{2,6}` |
| `issue` | `(repo_id,number)` PK, `title`, `body`, `state`, `owner_alias_id`, `is_open`, `close_reason?`, `reply_in?`, `compact_comment_id?`, `is_board`, `revision`, `updated_at` | state = queued/running/blocked/hold/done/failed/cancelled/pending-user.open/closed는 별도 축; closed는 terminal state만 |
| `comment_counter` | singleton `id=1`, `last_id bigint`(초기999999) | 댓글 저장 tx가 FOR UPDATE 후 +1; 전역 단조 증가·커밋 순서. 롤백은 게시/번호 소비 없음 |
| `comment` | `id bigint` PK, `repo_id`, `issue_number`, `body`, `envelope jsonb`, `metadata jsonb`, `author_alias_id`, `author_session_id`, `posted_by_alias_id`, `created_at`, `char_count`, `validity` | metadata는 §6.3 저장 계약. author_alias는 FROM의 논리 작성자, session/posted_by는 실제 서명자(proxy면 다를 수 있음). update/delete API 없음. `validity=v2`; legacy fixture/read model만 `noenv`. 정정은 SUPERSEDES 새 댓글 |
| `alias` | `id`, `owner_id`, `name`, `folded_name`, `status`, `renamed_to?`, `registered_at` | 소유자 전체 unique folded_name; 개명 전 이름은 tombstone, 재할당 금지 |
| `alias_repo` | `(alias_id,repo_id)` | repo 멤버십: ALL/공유 HOLD·DECISION 전파 집합. 온라인 여부와 독립 |
| `session` | `id`, `alias_id`, `sid`, `token_hash`, `expires_at`, `revoked_at?`, `kind=agent\|service` | unique(alias_id,sid); 동일 별칭의 쓰기 세션은 1개. 인계 시 old token revoke, old 구독 close. service session은 외부 토큰 발급 금지 |
| `subscription` | `id`, `session_id`, `channels`, `opened_at`, `closed_at?`, `last_heartbeat_at`, `transport` | 전송 연결과 연결하되 alias inbox 소유권을 변경하지 않음 |
| `directive` | `comment_id` PK, `recipient_alias_id`, `type`, `ack_by`, `acked_by_comment_id?`, `superseded_by?`, `applied_by_comment_id?`, `hold_released_by?` | ACK와 HOLD 해제는 별개. 열린 HOLD는 ACK 뒤에도 유지 |
| `directive_recipient` | `(comment_id,alias_id)` PK, `via=to\|mention`, `ack_comment_id?`, `applied_comment_id?` | 실제 TO와 mention 독자의 확인을 구분. directive의 단일 recipient는 실행 담당 TO |
| `claim` | `comment_id` PK, `alias_id`, `issue`, `due_at`, `released_by_comment_id?` | RELEASE RE가 가리키는 CLAIM과 1:1, 같은 작성자만 release; 자원 텍스트는 잠금 아님 |
| `handoff` | `comment_id` PK, `source_issue`, `target_issue`, `recipient_alias_id`, `acked_by?`, `status` | pending→accepted→completed; timeout은 pending 유지; target issue 존재/open 검사 |
| `delivery` | `id`, `source_event_id`, `source_stream_id`, `source_sequence bigint`, `comment_id?`, `recipient_alias_id`, `classification`, `ordinal bigint`, `state`, `ack_required`, `ack_by?`, `attempt`, `next_attempt_at`, `version` | source 3개는 canonical fact 좌표(§4.1). unique(source_event_id,alias_id), unique(alias_id,ordinal); late route도 ordinal 부여 후 inbox 등장. ack_required는 실제 TO 지시에만 true |
| `delivery_receipt` | `(delivery_id,session_id,attempt)` | received_at, transport, evidence. 중복 receipt는 멱등 |
| `inbox_clock` | `alias_id` PK, `last_ordinal` | FOR UPDATE로 ordinal 발급. comment id를 inbox cursor로 쓰지 않음 |
| `processed` | `(alias_id,delivery_id)` | disposition=acked/replied/ignored, `evidence_comment_id?`/`reason?`, recorded_by_session. 처리 cursor가 넘을 수 있는 근거 |
| `compact_segment` | `(repo_id,issue_number)`, `previous_compact_id?`, `through_id?`, `count`, `chars`, `due_reasons`, `generation` | 증분은 이벤트 natural key로 dedupe; 재구축 시 comment 원본에서 재계산 |
| `handoff`, `directive`, `claim`의 참조 | comment FK, target issue FK | 교차 이슈 RE 가능, owner 넘어가는 참조 금지; 접근 가능한 동일 owner에 한함 |
| `command_result` | `(principal_id,idempotency_key)` PK, `request_hash`, `operation_id`, `status`, `http_status`, `response jsonb` | 큐 접수와 pending row 원자 저장; 도메인 side effect와 완료 결과도 같은 tx. 같은 key 다른 내용 409 |
| `projection_applied` | `(projection_name,source_event_id)` PK | 중복 route/stats/ack/close projection 방어; 별도 command result와 역할이 다름 |
| `schedule` | `(kind,entity_id,generation)` PK, `run_at`, `attempt`, `state` | DB 시간이 기준; 동일 due tick 중복 방지 |

public broker 표: `event_store`, `event_stream_sequence`, `event_reader_cursor`, `event_subscription_cursor`, `agent_execution`, `agent_execution_recipient`. cursor에 `principal_id`, `expires_at`, `scope_hash` 추가; token은 immutable다. raw token·secret을 event_store에 남기지 않는다.

### 2.2 원자 쓰기와 재구축

HTTP 접수는 문법/권한 사전 검사 → `command_result pending + pgmq.sendOn`을 한 tx로 커밋 → 202다. 워커는 `context.fence()` 확인 뒤 단일 DB tx에서 command_result row와 대상 issue/alias 행을 잠근다. 이미 완료됐으면 저장 응답을 반환한다. 미완료면 상태 재검사 → 결정적 fact 작성 → `EventStore.appendManyOn` → 투영 및 command_result 완료 → COMMIT → 반환한다. command_result unique와 row lock이 lease 만료 뒤 두 핸들러의 동시 재실행도 한 논리 결과로 수렴시킨다. 검사·쓰기 사이 TOCTOU는 워커 tx에서 다시 검사한다.

critical fact에 `emit()`을 쓰지 않는다. 원본 consumer의 emit은 실패를 삼키고 execution 완료와 분리되므로, 문서 설명만 믿고 신뢰성 경로로 사용하면 안 된다. broker terminal result append가 나중에 실패해도 도메인 fact/결과는 이미 함께 영속되어 있고 재전달은 cached result만 반환한다. 외부 hook 성공을 이 DB 원자성 안에 있다고 주장하지 않는다.

잠금 순서: command_result → owner/alias(정렬된 id) → repo → issue(정렬된 repo/number) → comment_counter → inbox_clock(정렬 alias id) → event stream(정렬 streamId). 단일 tx timeout 5초, serialization/deadlock은 동일 idempotency key로 제한 재시도(100/300/1000ms, 이후 원본 큐 보존). 다른 워커의 결과/ACK/기한까지 기다리는 tx나 핸들러는 없다.

부팅은 migration 완료 후 broker ready. 재구축은 운영 명령 `issus admin rebuild --projection <name> --dry-run|--apply`로 shadow 테이블을 만들고, stream별 sequence watermark까지 fold 후 최신분을 따라잡아 원자 교체한다. pending/active schedule과 directive를 COMPACT로 삭제하지 않는다. 모든 도메인 fact는 snapshot 재생에 필요한 원문/식별자를 갖고, reducer는 중복과 역순 도착을 버전으로 제어한다.

### 2.3 별칭과 세션

기본 문법은 Python 그대로 `^[a-z0-9]{2,6}-(?:\d{1,5}-)?(?:[a-z0-9]{2,12}|[가-힣]{2,8})$`, 전체 Unicode code point ≤24. 설명의 role 2–8 영문 제한보다 검사 코드의 영문 2–12가 기준이다. sid는 `[a-z0-9-]{1,12}`; `/by-<alias>`는 별도 proxy 형식이며 bootstrap 권한 `post:proxy`만 허용한다. 일반 FROM은 인증 alias/sid와 일치해야 한다.

등록 tx는 owner 행 잠금 아래 전체 alias+tombstone을 비교한다. exact, case-only(진단용 구분), 양방향 substring(min length≥3), edit-distance-1(동일·한 글자 치환/삽입/삭제; 전치 아님) 중 하나라도 409 `ALIAS_CONFLICT`와 충돌 이름/근거 id를 반환한다. near 충돌은 --deep 옵션과 무관하게 서버에서 항상 전수 확인한다. 같은 alias의 /s2 승계는 신규 이름 등록이 아니라 session 재발급이다. 다른 별칭으로 온 오타를 자동 교정·자동 전달하지 않는다.

개명은 새 alias 검사를 먼저 통과하고 `ALIAS TO:ALL` 원문과 `issus.alias.renamed`를 동일 tx로 남긴다. 이전 댓글/TO는 불변, 새 요청은 old name에 409 `ALIAS_RENAMED`와 새 별칭 제안; 이미 old alias로 저장된 delivery/directive는 stable alias id를 통해 같은 좌석에 남는다. 권한·CLAIM은 세션 승계만으로 자동 승인되지 않는다. 신규 별칭 등록 API의 구조화 role/model/scope/repos와 ALIAS 공지 body를 함께 받으며 자유문장에서 registry를 추측하지 않는다.

등록·개명 공지 대상은 요청의 `announcementIssue:{repoId,number}` 또는 해당 repo board이며 반드시 존재해야 한다. repo 생성은 `<proj>-system` 서비스 별칭과 `/srv` service session을 먼저 예약하고 board 별칭과 함께 충돌 검사한다. bootstrap이 등록을 대리한 ALIAS 댓글의 FROM은 `<신규별칭>/by-<proj>-system`, 실제 author_session_id는 system/srv, envelope 원작성자는 신규별칭이다. 이 대리 경로는 bootstrap capability만 허용한다. agent의 첫 `/s1` 토큰은 이후 sessions API로 별도 발급한다. repo 최초 bootstrap에서는 board.created/alias.registered fact를 먼저 만들고 공지 댓글은 자기 board 생성 후 같은 tx에서 쓴다. 시스템 별칭에는 외부 세션을 발급하지 않는다. 일반 agent가 직접 ALIAS 공지를 쓰면 FROM은 자기 alias/sid여야 하며 registry 변경을 자유 본문으로 유추하지 않는다.

DECISION `6307832679` Q1 확정: 구현 FROM은 `issus-1-base`, `issus-1-agent`, `issus-1-domain`, `issus-1-core`, `issus-1-deliver`, `issus-1-compact`, `issus-1-client`, `issus-1-web` 8개다. `issus-1-impl-<영역>`은 폐기하며 배정 라벨로도 재사용하지 않는다. 정본 별칭 regex와 TYPE 13·봉투 문법은 변경하지 않는다.

### 2.4 이슈·게시판·이관·닫기

이슈 본문 첫 줄은 `STATE OWNER UPDATED` 순서 고정, 뒤에 `REPLY-IN COMPACT BOARD` 선택이다. body parser의 모든 문법 검사를 통과한 뒤 state/owner/pointer와 실제 열을 같은 tx로 일치시킨다. `If-Match: <revision>` 필수; 누락 428, 충돌 412. 시스템 COMPACT 포인터 수정도 revision을 증가시킨다. 사람이 OWNER를 직접 바꾸는 body 편집은 차단하며 handoff 경로로만 변경한다.

repo당 board는 unique `is_board` partial index 1개다. `autoBoard:true`이면 repo 생성 시 `<proj>-board` 별칭 충돌을 검사해 board issue/별칭/포인터/created fact를 한 tx로 만든다. 실패하면 repo 생성도 롤백하고 사용 가능한 boardOwner 별칭 지정 요청. 기본 `autoBoard:true`, 사람이 소유할 board session token은 bootstrap만 발급한다. board에는 NOTE/ACK/ALIAS/COMPACT만 허용, NOTE≤1500자; ASK/HOLD/DECISION/CLAIM 등 조율은 주제 이슈로 422 거부한다. board close 후 새 board 동시생성은 금지하고 같은 board 재개만 허용한다. CLI 발견 순서는 사용자 지정→본문 BOARD→핀 제목→label board→제목검색을 지원하되 native registry 포인터와 상충하면 409 `BOARD_CONFLICT`; silently override하지 않는다.

HANDOFF는 댓글 게시 시 pending row를 만든다. target OWNER가 자기 별칭의 `ACK RE:<handoff>`를 source 또는 target issue에 게시해야 accepted가 된다. ACK 수용과 동의는 다르므로 별도 `handoff.accept {handoffId,ackCommentId}` 구조화 명령으로 수용을 선언한다(반론 ACK는 accepted로 바꾸지 않음). accepted 후 source OWNER의 `handoff.complete`만 `issus.issue.handed-off`를 기록하고 source `REPLY-IN`을 원자 갱신한다. 만료·무응답은 책임 해제가 아니다. 대상은 새 책임의 target issue OWNER이며 source OWNER 기록은 감사상 보존한다. 동일 이슈 OWNER 변경은 targetIssue=self와 newOwner를 갖는 같은 ACK 절차를 쓴다.

닫기는 source OWNER 또는 bootstrap만 실행한다. 조건: terminal body STATE, 최종 REPORT(done/failed/cancelled), 새 COMPACT(최종 REPORT 및 HANDOFF 완료를 포함), 미답 ASK/강화된 ackState.waiting 지시 0(§5.2; legacy 해소만으로 통과 불가), active HOLD 0, 미RELEASE CLAIM 0, pending handoff 0. 사전 합의한 NON-SCOPE는 최종 REPORT에 명시하되 열린 지시를 자동 지우지 않는다. `POST close`가 위반 항목 id를 409 `CLOSE_BLOCKED`로 반환한다. 성공은 closed fact+본문+revision을 한 tx. 닫힌 이슈 새 작업 댓글은 409 `ISSUE_CLOSED`/replyIn 반환; 후속 라우팅 NOTE만 OWNER가 허용받는다. 재개는 OWNER가 이유와 상태를 제출해 reopened fact를 남긴다.

열린 board가 있으면 close tx가 완료 공유 NOTE를 board에 자동 게시한다. source와 board issue를 정렬된 순서로 잠그고, `FROM:<OWNER>/<sid> TO:ALL TYPE:NOTE RE:<최종REPORT> REPLY-IN:#<source>` 및 `완료 공유 #<n>: <title> — <terminal STATE>. 결과·교훈·산출물은 최종 REPORT <id> 참조.`를 생성한다. bootstrap 대리는 §2.3의 by-system 형식이다. 본문≤1500자, 사용자 원보고에 없는 교훈을 만들어내지 않으며 중복 키 `board-close:<issue>:<closeEventId>`로 1건만 저장한다. board 자신을 닫는 경우 이 NOTE는 생략한다. native repo는 board가 없거나 닫혀 있으면 409 `BOARD_UNAVAILABLE`로 close를 막고 board ensure/reopen을 안내한다.

## 3. 서버 검증과 오류 계약

**결정:** `packages/issus_domain/src/common/validation/{comment,issue-body,alias,time}/`에 순수 `checkComment(body):ValidationError[]`, `checkIssueBody(body):ValidationError[]`와 파서를 둔다. `src/server/validation/context/`는 DB/권한/현재시각 검증이다. 문법 사유의 한국어 message·순서는 issue_post.py와 동일하게 보존하고 stable code/path를 덧붙인다.

**근거:** CLI/UI/HTTP가 같은 검증기를 쓰되 규약 호환성과 실제 존재/권한을 분리해야 과거 날짜와 레거시 수신자 예시도 올바르게 시험할 수 있다. **대안:** HTTP route마다 regex를 복제하면 dry-run과 실제 게시가 어긋나므로 금지한다.

### 3.1 문법 검사 전수 범위

| 검사 | 반드시 이식할 동작 |
| --- | --- |
| envelope | BOM/레거시/빈 첫 줄, KEY:value token, 허용키, 중복키, FROM/TO/TYPE 필수. token 순서는 자유; key 대문자. body를 trim하거나 BOM 제거한 뒤 통과시키지 않음 |
| FROM | alias 정규식/길이, slash 첫 분리, sid 및 by-proxy 문법; 잘못된 sid·별칭 각각의 오류 순서 |
| TYPE | ASK/HOLD/DECISION/HANDOFF/ACK/PLAN/CLAIM/RELEASE/REPORT/VERIFY/NOTE/ALIAS/COMPACT 13종. 모르는 TYPE의 대체 힌트 표까지 이식 |
| STATE | enum 검사; REPORT 필수; REPORT/ACK/DECISION 외 사용 거부 |
| 시간 | DUE/ACK-BY/UPDATED ISO regex(초 optional, offset colon optional)와 실제 달력 유효성. date 없는 `18:30` 거부; JS Date의 날짜 자동 보정 금지 |
| 참조 | RE/SEEN/SUPERSEDES 숫자 목록, REPLY-IN `#n` 또는 `o/r#n`, MIRROR-OF `^https?://` |
| 수신자 | TO 정확히 한 alias 또는 ALL(대소문자 허용 후 의미는 ALL); comma/IP/숫자/issue/@/sid/역할명 거부. TO/CC 레거시 별칭 `[A-Za-z0-9가-힣_.-]{2,24}`는 문법상 유지. CC ALL/TO 동일 거부; 빈 CC 조각 처리도 원본과 동일 |
| 지시 | TO!=ALL, ACK-BY 필수. ASK 줄의 모든 @대상과 TO가 일치; TYPE ASK는 `ASK @<TO>:` 줄 정확히 1개. 비지시 TYPE의 ASK 줄 거부 |
| 추가 필수 | HANDOFF→REPLY-IN; ACK/RELEASE/VERIFY→RE; PLAN→DUE; CLAIM→DUE+SEEN; REPORT→STATE; COMPACT→SEEN |
| 본문 | 전체 봉투 포함 ≤4000 Unicode code point, Python splitlines와 호환. 다음 12줄 중 공백/--- 외 내용≥1(내용이 결론인지 의미 판단은 하지 않음). `Array.from(text).length` 사용 |
| VERIFY/ALIAS | VERIFY는 본문 줄 시작 `VERDICT:PASS\|FAIL\|BLOCKED` 경계, ALIAS는 TO:ALL |
| COMPACT | TO:ALL, 전체≤2000자, 2번째 줄 strip 결과가 정확한 강한 마커 regex, through 문자열=SEEN. marker issue 번호는 context 검사에서 실제 issue와 대조 |
| issue body | BOM, 허용 6키/중복/필수 첫 3키/STATE/OWNER(UPDATED 포함 레거시 허용)/시각/REPLY-IN·BOARD 형식/COMPACT 숫자. 원본의 missing-key KeyError가 가능한 입력도 TS에서는 422 사유로 반환; 500 금지 |

문법 module의 오류 문자열 정본은 §13의 hash로 지정한 Python 함수 전체다. 아래는 메시지 고정 예시이며 전체 문자열·보간·대체 TYPE 힌트를 golden JSON으로 추출해 비교한다.

```json
{"error":{"code":"VALIDATION_FAILED","reasons":[
  {"code":"ENV_REQUIRED","path":"envelope.TO","message":"필수 봉투 키 없음 TO"},
  {"code":"DIRECTIVE_ACK_BY","path":"envelope.ACK-BY","message":"지시성 TYPE ASK: ACK-BY 필수"}
]},"posted":false}
```

다른 대표 원문: `파일 첫머리 BOM 제거 필요(봉투가 깨짐)`, `봉투 키 중복 TYPE`, `TYPE VERIFY: 본문에 \`VERDICT:PASS|FAIL|BLOCKED\` 필수`, `TYPE ALIAS: TO:ALL 필수`, `TYPE COMPACT: 2번째 줄은 정확히 \`## ===== COMPACT #<이슈> through <SEEN id> =====\` (강한 마커)`. 길이와 시각 등 동적 값도 원문 보간대로다. 문법 오류 HTTP 422, 댓글·정상 게시 이벤트 없음. reject audit는 §4의 metadata-only failure만 기록한다.

### 3.2 상태 검증과 문법의 차이

live write는 등록된 FROM/TO/CC 존재, token-FROM 일치(승인된 proxy 예외 포함), repo 권한, 지시 ACK-BY>서버 접수시각, HOLD ACK-BY≤접수+10분·SEEN 필수, DUE 존재/과거 여부(과거 PLAN/CLAIM 거부), marker 실제 issue·SEEN 경계, RE의 존재·같은 owner/접근 권한, RELEASE 본인 CLAIM, SUPERSEDES의 동일 권한/대상, BOARD 제한을 검사한다. **ACK 게시에는 지시 수신자 자격·원문의 지시 TYPE을 요구하지 않는다**. ACK 특유의 정본 필수키는 RE뿐이며 일반 인증/참조 검사는 다른 댓글과 같다. legacy recipient는 bootstrap이 예약한 legacy alias가 실제 존재할 때만 전달하며 없으면 422 `RECIPIENT_UNKNOWN`이다. 읽기용 noenv는 실행·delivery ACK 의무 생성 금지이며 watcher 호환 pending 표시에는 경고와 함께 남을 수 있다.

원본 issue body는 첫 3키 순서 검사에 빈틈이 있으므로 서비스 context는 정확히 STATE→OWNER→UPDATED를 재검사한다. SEEN은 live CLAIM/COMPACT에서는 단일 기존 comment id 또는 빈 issue의 0만(문법은 목록 허용). COMPACT의 SEEN은 §6 snapshot과 일치해야 한다. HOLD를 실제로 해제하는 SUPERSEDES는 DECISION만, 발신자는 해당 issue OWNER/감독 또는 원 HOLD 발신자다. 다른 참조의 일반 정정 권한은 원 작성자/OWNER/감독이다. legacy read의 임의 SUPERSEDES도 §5.2 호환 pending 집계에는 포함하지만, 권한 없는 정정을 delivery 종결이나 HOLD 해제로 승격하지 않는다. ACK의 댓글 허용·호환 pending 해소·실제 TO 수신확인·반영/이관 수용은 서로 다른 판정이다.

문법 검증 API `/v1/validate`는 DB·현재시각을 보지 않는다. 이 endpoint와 실제 게시 preflight가 같은 문법 모듈을 쓰는 것을 통합 시험한다. 정형 32개(역사 날짜·레거시 이름·아직 없는 RE 포함)를 production post에 무조건 넣는 시험으로 오해하지 않는다. good 32 HTTP E2E는 원본 바이트를 유지하고 등록·실제 참조·Clock 주입으로 문맥을 먼저 준비한다. 댓글28개는 POST comment의 완료201, 본문4개(`issue-body-running/closing/cancelled`, `board-body`)는 신규 이슈 POST가 아니라 준비된 이슈의 본문 교체(`--edit-body`, PUT/PATCH body)의 완료200이다. 본문이 가리키는 COMPACT id·REPLY-IN 이슈·BOARD 이슈도 시험이 먼저 만들며, 32개 모두 서버 검증 통과가 수용 기준이다. 근거: DECISION 6310243238 (1).

**무변경 서버 preflight(P1-b):** `POST /v1/repos/:owner/:repo/issues/:number/preflight`는 인증된 principal, 경로의 repo/issue, §7.2의 `mode,request`(본문·제출 metadata), 요청 접수 시 서버 `Clock.now()`를 받아 위 문법·문맥 검사와 compact due 계산을 실행한다. 현재시각은 응답 `context.checkedAt`이며 클라이언트 지정 시각은 받지 않는다(시험 Clock 주입만 허용). REPEATABLE READ의 읽기 전용 snapshot에서 검사하고 DB 행·revision·token·packet·due·cursor·감사 event·command_result·PGMQ를 생성/변경하지 않는다. 인증 경로도 last-seen 갱신 등의 쓰기를 하지 않는다. DECISION/HANDOFF의 선행 요약 사유는 계산 결과에만 포함하며 due를 기록하거나 packet을 발급하지 않는다. 결과는 해당 시각·snapshot의 진단이므로 실제 게시의 접수/worker 최종 재검사를 생략할 근거가 아니다. P4 `issus-1-core`가 `apps/issus/src/server/http/preflight/**`와 공통 context 검사 연결·I-P1을 소유하고, P7 `issus-1-client`는 CLI dry-run에서 소비한다(루트 route 조립은 P1 경계 유지).

## 4. 이벤트 목록과 반응표

**결정:** action은 `issus.<entity>.<past-tense>` fact와 `issus.<entity>.<imperative>` command로 나눈다. comment TYPE은 봉투 데이터이며 action 13개로 복제하지 않는다. 패밀리별 wire type/상수/parser는 `issus_domain/common/protocol/<family>/`의 단일 정본이다.

**근거:** 댓글 게시 후 전달·통계·제어 처리가 독립적으로 반응하면서 브로커는 TYPE을 몰라도 된다. **대안:** 브로커에 TYPE 분기/alias lookup을 넣는 것은 도메인 무관성 때문에 배제한다.

### 4.1 공통 envelope와 payload 약속

모든 event는 agent EventEnvelope v1: `eventId,eventVersion:1,kind,streamId,sequence,action,transactionKey,channel,replyChannel?,causationEventId?,correlationId,source,audience,payload,createdAt`. sequence는 stream 내부 문자열 bigint다. `audience`는 `worker|client`; 생략 기본값에 의존하지 않고 명시한다. actor는 `{ownerId,aliasId,alias,sid,sessionId}`이며 token은 없다. payload 첫 공통키 `ownerId`, repo 사건은 `repoId`, issue 사건은 `issueNumber`, `revision`. 아래 C는 client, W는 worker다.

canonical issue event는 `streamId=channel:issue:<repoId>:<n>`, channel=`issue:<repoId>:<n>`; repo는 `channel:repo:<repoId>:all`; alias fanout은 `channel:alias:<ownerId>:<aliasId>`. 임의로 sessionId를 넣어 canonical issue 순서를 작성 세션별로 쪼개지 않는다. 작성 session은 payload actor에 있다. fanout은 새 eventId, `sourceEventId`/`causationEventId`로 원본 연결. factory의 createDerivedDraft가 원 stream을 계승하므로 fanout 생성자는 stream을 새 채널에 명시적으로 맞춘다.

**반응 입력 출처 계약(P1-1):** 원본 `reaction-enqueue.work`는 eventId/transactionKey를 `deterministicEventId("react:"+queueName+":"+fact.eventId)`로 바꾸고 원 stream/sequence를 전달하지 않는다. issus vendor의 P2 패치가 다음 3개를 **반응 IngressEvent top-level**에 함께 각인한다. 도메인 발행자가 payload에 미리 넣는 방식은 쓰지 않는다.

| 필드 | 채우는 곳 / 값 | 소비·보존 |
| --- | --- | --- |
| `sourceEventId` | broker `work(fact,queue)`의 `fact.eventId` | 원 canonical fact id. 반응 실행 eventId나 그 causation id로 대체하지 않음 |
| `sourceStreamId` | 같은 함수의 `fact.streamId` | 원 fact stream, 반응을 append해 새로 받은 stream과 구분 |
| `sourceSequence` | 같은 함수의 `fact.sequence` | 10진 문자열 bigint; 원 fact 순번. 반응 저장 순번과 구분 |

세 키는 optional generic provenance 묶음으로 agent `IngressEvent/EventEnvelope/EventDraft` 타입·parser에 추가하되 반응 큐 입력에는 전부 필수다. `broker/ingress/event-draft.ts`의 toEventDraft, event-store 직렬화/역직렬화, worker 전달 및 channel parser가 이를 누락 없이 보존한다. 외부 HTTP/WS command에서 지정하면 unknown/server-only key 오류로 거부한다. 원 payload는 그대로 유지한다. 누락·불일치 반응은 실패 기록 후 원 큐 보존/운영 경보, worker가 자기 eventId로 fallback하지 않는다. 도메인 UoW는 sourceEventId로 원 fact를 조회해 stream/sequence/owner/action이 일치함을 확인한다. 재구축은 canonical fact 자신을 3개 source 값으로 쓰는 동일 입력 adapter를 통과한다.

브로커 실행 멱등 키는 `(queueName,fact.eventId)`에서 파생한 위 react identity다. 도메인 `projection_applied` 키는 `(projection_name,sourceEventId)`, delivery 생성 키는 `(sourceEventId,recipientAliasId)`다. 새 queued/redelivered fact의 **payload**에도 동일한 source 3개를 넣고 delivery 열에 저장하며, 반응 envelope 자신의 eventId/streamId/sequence를 복사하지 않는다. 같은 원 fact가 서로 다른 큐로 가거나 재적재돼도 segment/ACK projection은 각 1회, 동일 수신자 delivery는 1건이다. queued→deadline 같은 후속 반응의 top-level provenance는 그 입력 queued fact 좌표이고, queued payload의 source 3개는 원 댓글 fact 좌표이므로 서로 덮어쓰지 않는다.

### 4.2 명령 카탈로그

외부 명령은 HTTP 공통 제출기만 허용하고 WS는 구독/receipt 전용이다. 각 명령은 kind=command, audience=W, source=client(인증 actor는 서버 각인), channel=`internal:intake`, reply=`session:<sessionId>`, queue=`issus_intake`; 내부 명령은 아래 큐가 다르다. schema에 없는 키 거부. payload의 body/envelope actor 중복 값은 권위가 아니다.

| action | payload(공통 actor/idempotency 제외) | 처리/결과 |
| --- | --- | --- |
| `issus.repo.create` | owner,slug,projectCode,autoBoard,boardOwner? | intake → repo.created(+board.created) |
| `issus.issue.open` | repoId,title,body | intake → issue.opened |
| `issus.issue.body.edit` | repoId,issueNumber,body,expectedRevision | intake → issue.body.edited |
| `issus.comment.post` | repoId,issueNumber,body,compactPacketToken?,sampledIds?,compactedBy?,compactDeferredReason? (§6.3 단일 schema) | intake → comment.posted / comment.rejected. HTTP 필드 이름 그대로 명령에 보존 |
| `issus.alias.register` / `issus.alias.rename` | owner,name,role,model,scope,repos,announcementIssue?,announcementBody / aliasId,newName,announcementIssue?,announcementBody | intake → alias.registered/renamed |
| `issus.board.ensure` | repoId,boardOwner,body? | intake → board.created, 이미 있으면 기존 board 반환 |
| `issus.handoff.accept` / `issus.handoff.complete` | handoffId,ackCommentId / handoffId,expectedRevision | intake → handoff.accepted / issue.handed-off |
| `issus.issue.close` / `issus.issue.reopen` | repoId,issueNumber,reason,finalReportId,expectedRevision / reason,state,expectedRevision | intake → issue.closed/reopened |
| `issus.delivery.receive` | deliveryIds,attempts,subscriptionId? | `issus_delivery` → delivery.delivered |
| `issus.delivery.apply` | deliveryId,evidenceCommentId,outcome=applied\|not-applied,reason? | `issus_delivery` → delivery.applied / application.rejected |
| `issus.inbox.process` | deliveryIds,disposition,evidenceCommentId? / reason? | `issus_delivery` → inbox.processed |
| `issus.clock.tick` | slot(UTC 5초 경계) | `issus_schedule`, source=scheduler → due scans 1 batch≤100 |

auth session 발급·철회·subscription lifecycle은 접속 제어 서비스가 metadata fact를 동일 DB tx로 남긴다. 여기서 worker ACK를 기다리지 않으며 토큰 자체를 이벤트로 만들지 않는다.

### 4.3 fact/failure 카탈로그와 반응표

`—`는 후속 반응 없음. runtime generic `*.result`, `*.conflict`, `*.processing.failure`는 명령 실행 결과이며 별도 도메인 fact를 대신하지 않는다. result는 session 채널에만, worker reaction result는 audience=W. 반응표에는 필요한 항목만 넣어 `.result.result` 무한 연쇄를 금지한다.

| action | payload의 필수 내용(공통키 외) | kind / audience / channel | reaction queue → handler |
| --- | --- | --- | --- |
| `issus.repo.created` | slug,projectCode,autoBoard,actor,version | fact/C/repo | — |
| `issus.issue.opened` | number,title,body,state,ownerAliasId,isBoard,actor | fact/C/issue | `issus_route`→issue-notify |
| `issus.issue.body.edited` | body,previousRevision,revision,reason,actor | fact/C/issue | `issus_route`→issue-notify |
| `issus.comment.posted` | commentId,body,envelope,metadata(§6.3),charCount,author,validity | fact/C/issue | `issus_route`→comment-route; `issus_compact`→segment-update; `issus_delivery`→ack/legacy-reference/RELEASE/HOLD/handoff-index |
| `issus.comment.rejected` | requestId,actorAliasId,issue?,errorCodes,bodySha256,charCount(본문 없음) | failure/W/internal:audit | — (metrics+운영 조회만) |
| `issus.delivery.queued` | deliveryId,sourceEventId,sourceStreamId,sourceSequence,commentId?,aliasId,ordinal,classification,ackRequired,ackBy?,attempt=0,content | fact/C/alias | `issus_schedule`→deadline-register |
| `issus.delivery.delivered` | deliveryId,sessionId,transport,attempt,receivedAt | fact/C/alias | — |
| `issus.delivery.acked` | deliveryId,directiveId,ackCommentId,ackAliasId | fact/C/alias | `issus_schedule`→deadline-recheck-legacy |
| `issus.delivery.applied` | deliveryId,directiveId,evidenceCommentId,outcome,actor | fact/C/alias | — |
| `issus.delivery.overdue` | deliveryId,directiveId,ackBy,attempt,overdueAt | fact/W/internal:delivery | `issus_delivery`→retry-plan |
| `issus.delivery.redelivered` | deliveryId,sourceEventId,sourceStreamId,sourceSequence,commentId,attempt,content,nextAttemptAt | fact/C/alias | — |
| `issus.delivery.escalated` | deliveryId,directiveId,recipient,ownerAliasId,supervisorAliasId?,attempt,reason | fact/W/internal:delivery | `issus_route`→owner+supervisor inbox notification |
| `issus.delivery.superseded` | deliveryId,byCommentId,reason | fact/C/alias | `issus_schedule`→deadline-recheck-legacy |
| `issus.compact.due` | issue,ownerAliasId,previousCompactId?,count,chars,reasons,generation | fact/W/internal:compact | `issus_route`→owner inbox notification |
| `issus.compact.posted` | compactId,previousCompactId?,throughId,packetHash,count,chars,bodyRevision,metadata(§6.3의 COMPACT 저장 metadata) | fact/C/issue | `issus_route`→issue-notify; `issus_compact`→reset-segment |
| `issus.issue.closed` / `issus.issue.reopened` | reason,finalReportId?,compactId?,body,actor,revision | fact/C/issue | `issus_route`→issue-notify |
| `issus.handoff.accepted` | handoffId,ackCommentId,targetIssue,newOwnerAliasId | fact/C/issue | `issus_route`→issue-notify |
| `issus.issue.handed-off` | handoffId,ackCommentId,sourceIssue,targetIssue,oldOwner,newOwner,body,revision | fact/C/source issue | `issus_route`→source+target owners |
| `issus.alias.registered` / `issus.alias.renamed` | aliasId,name,oldName?,repos,role,model,scope,actor (`model`은 ROSTER 복원에 필수. 근거: DECISION 6310243238 (2)) | fact/C/repo(공지 repo별 사본) | — |
| `issus.board.created` | repoId,issueNumber,ownerAliasId,title,body | fact/C/repo | `issus_route`→repo-notify |
| `issus.subscription.opened` / `issus.subscription.closed` | subscriptionId,aliasId,sid,sessionId,channels,transport,reason? | fact/W/internal:subscription | — (감사/계측) |
| `issus.session.opened` / `issus.session.revoked` | sessionId,aliasId,sid,expiresAt?,reason? | fact/W/internal:auth | — (secret 없음) |
| `issus.inbox.processed` | aliasId,deliveryId,disposition,evidenceCommentId?,reason? | fact/W/internal:inbox | — |
| `issus.application.rejected` | deliveryId,evidenceCommentId,reason | failure/C/alias | — |

route handler는 comment 원문에서 classification과 수신자 set을 계산하고 dedupe natural key로 delivery rows+queued fact를 같은 tx로 만든다. 원 지시를 수신자가 ACK한 뒤 route가 늦게 돌아도 directive projection을 먼저 읽어 acked 상태로 합류한다. segment/ACK projection은 입력 fact가 가리키는 comment를 정본 조회하므로 역순 reaction 도착을 견딘다. `comment.posted`의 projection 완료 여부와 무관하게 post transaction은 열린 지시/CLAIM 등 닫기 차단용 인덱스를 즉시 갱신한다. 비동기 ACK handler는 전달 fact 발급을 보완할 뿐 안전 판정이 비동기 지연에 의존하지 않는다.

모든 TYPE의 RE/SUPERSEDES 저장 tx는 호환 reference index도 즉시 갱신한다. scheduler는 §5.2의 전구간 pendingLegacy를 tx 안에서 재검사한다. REPORT 등으로 legacy pending만 해소되면 재알림 schedule만 취소하고 `delivery.acked`·`delivery.superseded`를 만들지 않는다. `ackState`가 waiting인 사실은 그대로다.

브로커는 위 반응표를 `reactionsName:"issus-v1"`로 받고 큐 사본만 적재한다. 큐명→handler 묶음은 `apps/issus-worker/src/server/roles/*/`, 반응표는 `apps/issus/src/server/reactions/`가 유일 정본이다. queue/action 상수는 `issus_domain/common/protocol/runtime/`에서 공유하며 형제 app 소스를 import하지 않는다. worker가 다음 worker/queue를 직접 호출하지 않는다.

## 5. 구독·전달 모델과 커서

**결정:** push와 pull은 같은 alias inbox를 소비한다. 구독은 연결, 전달 의무는 alias에 귀속한다. 전송 성공을 ACK로 간주하지 않고 수신 클라이언트의 receipt와 작성자의 `TYPE:ACK RE:`를 각각 기록한다. push는 WebSocket 필수, SSE도 같은 hub/replay의 읽기 어댑터로 제공한다.

**근거:** 상주 세션이 없어도 요청은 쌓이고 승계 세션이 처리할 수 있어야 한다. **대안:** WebSocket 연결 목록만으로 recipient를 계산하면 오프라인 에이전트가 사라지므로 채택하지 않는다.

### 5.1 채널과 수신자 계산

| 채널 | 구독 권한/의미 | 기본 여부 |
| --- | --- | --- |
| `alias:<ownerId>:<aliasId>` | 자기 alias의 영속 inbox; sid를 채널 이름에 넣지 않음 | 세션 연결 시 강제 포함 |
| `repo:<repoId>:all` | 동일 owner의 repo 멤버; repo/board 변경과 공지 | 선택. ALL 댓글의 필수 수신은 alias inbox로 보장 |
| `issue:<repoId>:<number>` | repo 멤버의 UI/관찰용 canonical 전체 사건 | 선택. 구독 안 해도 TO/CC/HOLD/DECISION은 inbox 도착 |
| `session:<sessionId>` | 명령 결과, 자기 세션만 | 기본 포함 |
| `supervisor:<ownerId>` | bootstrap 또는 설정된 감독 alias | 감독 기본 포함. 에스컬레이션도 감독 alias inbox에 영속 복제 |
| `internal:*` | 외부 구독 금지, audience=W | 서버만 |

채널 최대 32개/각 128자, unknown/타인 alias/타인 session/internal 요청은 HTTP 403 또는 WS 1008. 클라이언트 지정 channel·replyChannel·audience로 타인에게 결과를 보내지 못한다. 구독 변경은 새 scope cursor를 발급하고 pending delivery를 그대로 유지한다.

댓글 한 건의 후보 set: 실제 TO alias(ALL이면 repo 멤버 전부), CC, 경계 일치하는 본문 `@alias`, 모든 repo 멤버(HOLD/DECISION 또는 TO:ALL), issue OWNER(COMPACT·compact.due), 명시 issue 관찰 멤버다. 등록 이름은 regex escape 후 `@name(?![\w가-힣-])` case-insensitive로 검사한다. 후보마다 아래 함수를 적용해 가장 앞선 class 하나만 선택한다.

1. `[ME]`: TO가 내 별칭이거나 본문 @내별칭 → 전문.
2. `[CC]`: CC 포함 → 전문, CC만으로는 ACK 의무 없음.
3. `[ALL]`: TO:ALL, 레거시 TO 없음, 타인에게 보낸 HOLD/DECISION → 전문.
4. `[OTHER]`: 나머지 타인 간 ASK/HANDOFF/정보 → 봉투만, `--show`로 전문.

own FROM은 watch 기본 출력에서 제외하되 source event/서버 감사에서 삭제하지 않는다. 동일 alias가 TO/CC/ALL/관찰에 겹쳐도 하나의 delivery만 만든다. 직접 TO/본문 mention은 멤버십 등록 누락을 이유로 버리지 않는다(같은 owner의 등록 alias여야 함). OTHER는 해당 issue를 watch하는 alias에게만 만든다. live 접속 여부는 수신자 계산에 사용하지 않는다.

정본 호환 PENDING-ACK 후보는 자기 FROM을 제외한 `[ME]` 지시성 TYPE(ASK/HOLD/DECISION/HANDOFF)이며 TO 일치 또는 본문 mention이면 포함한다. 반면 실제 delivery의 `ackRequired:true`와 실행 담당은 **지시의 실제 TO 1명**뿐이다. `directive_recipient(comment_id,alias_id,via=to|mention,ack_comment_id?,applied_comment_id?)`는 보조 독자의 ACK 참조를 따로 기록하며 mention ACK가 TO의 delivery를 acked로 만들지 않는다. CC만 있는 사람과 ALL 관찰자는 호환 pending 후보도 아니다(본문 mention이 있으면 ME 우선). HANDOFF 수용·HOLD 중단 반영은 실제 TO의 직접 ACK/증거만 인정한다. 자동 에스컬레이션의 주 대상은 TO이며 mention-only 호환 pending은 digest 경고로 합친다. 둘 다 재알림 eligibility는 §5.2 pendingLegacy 기준이다.

본문 mention을 수신자로 추가할 때 registry에 없는 @문자열은 그냥 본문이며 TO/CC와 달리 unknown recipient 오류를 만들지 않는다. 신규 join 시 과거 ALL 전체를 복제하지 않고 최신 COMPACT+이후 history를 bootstrap 조회하며 현재 미해결 지시는 별도 pending 배열로 받는다. 신규 alias가 과거 지시의 실제 TO가 되는 일은 없다.

### 5.2 상태기계와 ACK/반영

```text
comment.posted → delivery.queued (state=posted)
posted → delivered         : 클라이언트 receipt가 해당 id를 확인
posted/delivered → acked    : 지시의 실제 TO alias가 직접 TYPE:ACK RE:<원 comment id> 게시
acked → applied            : 명시 apply 명령 + 본인 REPORT/VERIFY 근거 검증
posted/delivered → superseded : 권한 있는 정정/해제에 의한 종결
pendingLegacy.global에 남은 지시만 overdue → redelivered / escalated (ackState와 별도)
```

정보성 delivery는 `ackRequired:false`; delivered 후 `inbox.process`로 읽기 처리를 완료한다. ACK를 강제하지 않고 applied 상태도 요구하지 않는다. ACK가 receipt보다 먼저 오면 수신했다는 별도 `delivered` 증거를 ACK에서 유도하고 acked로 전진한다(`transport=ack-evidence`, 소켓 receipt로 위장하지 않음). 뒤늦은 receipt/retry는 상태를 후퇴시키지 않는다. reconnect도 applied→delivered로 덮어쓰지 않는다.

**ACK 댓글 허용:** 정본 `issue_post.py`대로 ACK에는 RE가 필요하다. 일반 댓글의 인증·봉투·존재/접근 검사 외에 지시 TYPE, TO 수신자 여부, directive_recipient 등록을 게시 조건으로 더하지 않는다. board의 `ACK RE:<NOTE>` 답변, `examples/ack-yield.md`의 타인 CLAIM에 대한 양보, 제3자의 지시 참조 ACK 모두 허용한다. RE 복수는 각 참조의 존재/접근 권한을 검사하며 NOTE+CLAIM+지시 혼합도 허용한다. 같은 본문 재게시/idempotency는 공통 규칙만 적용하고, 다른 내용의 후속 ACK도 저장한다. `ACK_ALREADY_RECORDED`·`PROXY_ACK_FORBIDDEN`을 ACK 게시 거부 코드로 사용하지 않는다. proxy는 일반 `post:proxy` 권한이 있으면 게시 가능하다.

**delivery ACK 효력:** 각 RE에 대해 원문이 지시이고 인증 alias=논리 FROM=원 지시 TO이며 proxy가 아닌 직접 게시일 때만 해당 TO delivery를 acked로 전이한다. 최초 유효 직접 ACK를 `acked_by_comment_id`에 고정하고 후속 ACK는 참조 이력만 추가하여 상태 fact를 중복 발급하지 않는다. 같은 alias의 /s2 승계는 허용한다. NOTE/CLAIM ACK, 타인/mention-only ACK, proxy ACK는 저장되지만 지시 delivery 상태를 바꾸지 않는다. proxy FROM이 내 alias인 경우도 watcher 호환 계산에는 정본대로 반영될 수 있고, 이것을 실제 직접 ACK 증거로 해석하지 않는다.

`apply`는 실제 TO가 쓴 REPORT 또는 VERIFY의 RE에 원 directive가 있고, TO의 직접 ACK가 이미 있으며, 근거가 동일 owner에 존재할 때 허용한다. ACK 전이면 409 `ACK_REQUIRED`, 무관한 근거면 422다. `outcome=applied`는 **반영 보고가 제출됨**이지 서비스가 외부 프로세스/시험 PASS를 검증했다는 뜻이 아니다. 반론·부분수용 ACK는 acked에 머물고 별도 REPORT 근거가 없으면 적용 완료로 표시하지 않는다. `not-applied`는 application.rejected와 reason을 남긴다. HANDOFF 수용은 §2.4의 명시 acceptance가 추가로 필요하다.

HOLD는 ACK 후에도 active다. 권한 있는 `DECISION SUPERSEDES:<holdId>`만 해제 fact의 근거가 된다. 서버는 active HOLD를 해당 alias/issue의 받은편지함 상단에 유지하고 새로운 CLAIM/실행 개시 PLAN을 409 `ACTIVE_HOLD`로 막는다. 서비스 밖에서 실행한 프로세스를 강제로 죽이지 않는다. 새 CLAIM·DECISION의 409 `PENDING_ACK` 장벽은 actor 단일 별칭의 `pendingLegacy.global` 기준이다. ACK/HOLD/REPORT/긴급 정정 자체는 이 장벽으로 막지 않는다. 닫기의 미ACK 지시 gate는 별도 강화 상태 `ackState.waiting`을 검사하며, legacy pending 해소만으로 닫기를 승인하지 않는다.

**두 계산의 고정 계약(P0-1):** `pendingLegacy`가 읽기 API·inbox·CLI watch 기본 PENDING-ACK이고, `ackState`는 실제 수신 상태의 별도 필드다. `issue_watch.py`의 header/to_me/ids/집합 연산을 순수 호환 함수로 이식한다. native COMMENT id는 초기값을 1000000 이상으로 발급해 정본 `ids()`의 6자리 이상 추출과 일치시키며 기존 fixture id는 원문 그대로다. 입력 구간 R과 정규화된 내 별칭 집합 M(§8)에 대해 다음을 적용한다.

```text
myRe(R,M) = UNION header(c)._re  for c in R where header(c)._from in M  # TYPE 무관
sup(R)    = UNION header(c)._sup for 모든 c in R                       # FROM/TYPE 무관
pendingLegacy(R,M) = { c in R | FROM(c) not in M,
  TYPE(c) in {ASK,HOLD,DECISION,HANDOFF}, to_me(c,M),
  str(id(c)) not in myRe(R,M), str(id(c)) not in sup(R) }
```

집합은 issue별 계산한다(별도 이슈에 쓴 RE는 해당 원 issue watcher 집계에 포함되지 않음). own FROM 생략은 출력 시점뿐 아니라 위 후보 판정에도 적용한다. cursor/unread 경계로 R을 축소하지 않는다. `_from`은 sid/proxy 앞 alias를 lower, `_re/_sup`는 정본 ids() 그대로이며 legacy NOENV도 표시 계산에는 포함한다. NOENV는 실행/자동 전달 원문으로 사용하지 않는다.

| API 필드 / CLI 표기 | 구간·의미 | 해소 기준 / 소비자 |
| --- | --- | --- |
| `pendingLegacy.window` = `windowPendingAck` / `PENDING-ACK` | 최신 COMPACT 자체+이후, 없으면 전체. all-history면 전체 | 위 호환 집합. 기본 읽기·inbox·CLI와 Python 대조 대상 |
| `pendingLegacy.global` = `globalPendingAck` / `PENDING-ACK-GLOBAL` | 해당 issue 전체 comment history | 동일 호환 집합. 보완 배열로 별도 표시, 재알림·PENDING_ACK 장벽 기준 |
| `ackState` / `ACK-STATE` | 실제 token alias의 전구간 `{items:[{directiveId,deliveryId?,state,ackCommentId?,supersededBy?}],waiting:[directiveId...]}`. waiting은 직접 ACK/권한 있는 종결이 없는 id, state는 delivery 상태 | 실제 TO의 유효 직접 ACK 또는 권한 있는 종결만. receipt/반영 추적·close gate·감사·별도 지표; legacy pending을 대신하지 않음 |

**재전달·에스컬레이션(mention digest 포함)은 단일 수신 별칭의 전구간 `pendingLegacy.global`만 트리거한다.** COMPACT window만으로 schedule을 취소하지 않고 전구간으로 재검사한다. 예: ASK 뒤 내 REPORT RE만 있으면 두 legacy 배열에서 해소되지만 ackState는 waiting, delivery는 delivered에 머무르며 재알림은 멈춘다. 이것을 ACK 수신 완료로 표시하지 않는다. 활성 HOLD·미RELEASE CLAIM·pending handoff는 별도 전구간 배열이며 COMPACT나 호환 RE가 삭제하지 못한다.

### 5.3 기한·재전달·에스컬레이션

스케줄러 프로세스의 5초 ticker는 DB advisory lock으로 한 producer만 `issus.clock.tick`를 `issus_schedule`에 넣는다. tick handler는 DB `now()` 이하 due row를 `FOR UPDATE SKIP LOCKED LIMIT 100`으로 집어 독립 항목씩 끝낸다. timer에서 ACK를 기다리는 worker는 없다. 재시작 시 lookback 제한 없이 미종결 due를 다시 스캔한다. tick key는 UTC slot이며 중복 tick은 멱등이다. max run batch 100 이후 다음 tick 처리; overdue backlog/oldest lag metric으로 포착한다.

| 시점 | 동작 | 고유키/종결 조건 |
| --- | --- | --- |
| ACK-BY 경과(첫 5초 scan 이내 목표) | pendingLegacy.global에 남은 native 지시만 overdue fact, 동일 deliveryId 재전달 attempt1 | `overdue:<deliveryId>:1`; 호환 해소면 무처리 |
| 이후 +30초/+120초 | attempt2/3 재전달; 새 댓글 생성 금지 | `retry:<deliveryId>:<attempt>` |
| 첫 HOLD overdue | 즉시 OWNER·감독·원발신자에게 escalation inbox + supervisor 채널 | 수신자 합집합 dedupe; OWNER=실행자여도 감독 경보 남음 |
| 일반 지시 attempt3 후에도 legacy 미해소 | OWNER·감독·원발신자 escalation | same directive/level에 1개, 정보성이고 ACK 요구 없음 |
| 계속 legacy 미해소 | 자동 재전달은 3회 후 멈춤; escalation digest 15분마다, 의무는 유지 | 무응답을 동의·실패 완료·이관 완료로 전환하지 않음 |
| 내 모든 TYPE RE 또는 모든 SUPERSEDES로 legacy 해소 | future retry/escalation/digest schedules 취소. ACK 효력은 별도 | tx에서 pendingLegacy.global 재계산, reference/tick race 방어. 별도 이슈 ACK만 있으면 원 issue의 legacy 집합을 다시 확인 |

재전달은 새 delivery를 만들지 않고 sourceEventId/commentId를 유지한다. 전송 eventId만 attempt별 새 값이므로 UI는 deliveryId 기준 같은 항목의 횟수로 갱신한다. 오프라인이면 inbox에 남고 실제 delivered는 찍지 않는다. PGMQ 처리 재시도와 ACK 기한 재전달은 다른 예산이다. 소켓 연결 확인·hook HTTP 2xx·OS command exit0은 ACK가 아니다.

**WS 인증·전달 확정:** §7.1의 Authorization 헤더·browser cookie 방식에 더해 `Sec-WebSocket-Protocol`에 `issus.v1`과 `issus.bearer.<token>`을 함께 제시하는 인증을 허용한다. 서버는 bearer를 읽되 응답 subprotocol에는 `issus.v1`만 반환한다. query string 토큰은 금지하며 subprotocol bearer도 로그·fact에 남기지 않는다. WS 구독은 인증 별칭 채널만 보내는 필터형이 기본이며 firehose를 기본 구독으로 쓰지 않는다. 전달 프레임1개는 이슈·댓글 id·봉투·priority·delivery 상태를 포함하는 자족적 한 줄 JSON이어야 한다. body의 줄바꿈은 JSON escape로 전달하여 Monitor 알림 한 개만으로 처리할 문맥을 제공한다. 근거: DECISION 6310757267 (1)(2).

### 5.4 스트리밍 프레임·재생·처리 커서

인증한 session은 subscription API로 채널 권한과 immutable 시작 cursor를 발급받는다. `from=since-compact`는 §5.5와 같은 bootstrap builder로 최신 COMPACT(없으면 처음)+이후 원문과 inbox를 병합하고 pendingLegacy/ackState/activeHold를 먼저 제공한 뒤 snapshot watermark에서 live를 연결한다. 중복 제거는 §5.5의 comment viewKey와 원 fact sourceEventId를 적용한다. 보통 reconnect는 마지막 **수신 확인한** transport cursor로 재생한다.

```json
{"type":"subscribe","subscriptionId":"sub-uuid","channels":["alias:owner-uuid:alias-uuid","session:session-uuid"],"cursor":"opaque-uuid"}
{"type":"ready","channels":["alias:owner-uuid:alias-uuid","session:session-uuid"]}
{"type":"subscribed","subscriptionId":"sub-uuid","channels":["alias:owner-uuid:alias-uuid"],"cursor":"opaque-uuid","replayComplete":true}
{"type":"event","event":{"eventId":"event-uuid","eventVersion":1,"kind":"fact","action":"issus.delivery.queued","streamId":"channel:alias:owner-uuid:alias-uuid","sequence":"17","transactionKey":"react-key","channel":"alias:owner-uuid:alias-uuid","audience":"client","correlationId":"request-uuid","causationEventId":"comment-event-uuid","source":"worker","createdAt":"2026-10-21T04:00:00Z","payload":{"ownerId":"owner-uuid","deliveryId":"delivery-uuid","sourceEventId":"comment-event-uuid","sourceStreamId":"channel:issue:repo-uuid:1","sourceSequence":"9","commentId":"1000001","ordinal":"17","classification":"ME","ackRequired":true,"attempt":0,"content":{"body":"FROM:...\n..."}}},"cursor":"next-immutable-uuid"}
{"type":"receipt","subscriptionId":"sub-uuid","deliveryIds":["delivery-uuid"],"attempts":[0],"cursor":"next-immutable-uuid"}
{"type":"replay","cursor":"next-immutable-uuid","replayComplete":true}
{"type":"error","code":"CURSOR_SCOPE_MISMATCH","message":"커서의 세션·채널 범위가 다릅니다","retryable":false}
```

위 UUID/주소/봉투 `...`는 설명용 축약이며 실제 frame parser 시험은 유효 UUID·완전 봉투를 사용한다. event payload schema는 §4 action별 타입 그대로다. subscriptionId·receipt·error는 agent channel protocol에 추가하는 일반 전송 계약이고 deliveryIds 내용의 해석은 app이 주입한 callback이 맡는다. app callback에 넘기기 전 auth/shape/길이≤100을 검사한다. WS mutations(`type:event`)는 issus 배포에서 거부하며 allowedActions=[]; 웹·CLI의 게시 모두 HTTP 경유다.

원본은 같은 cursor token의 position을 send callback 뒤 갱신하여 클라이언트 미수신 구간을 건너뛸 수 있다. **issus는 매 프레임이 가리키는 위치를 새 token snapshot으로 만든다.** 기존 token은 불변, client는 프레임을 받은 뒤만 local 수신 cursor를 저장한다. 서버는 socket.send 성공으로 처리 cursor를 전진시키지 않는다. 같은 token을 재사용하면 중복 재생은 가능하고 유실은 없어야 한다. UUID cursor는 owner/session(또는 alias processing scope)/정렬된 channel-set/stream별 position에 결합되고 TTL 30일; 만료·다른 scope는 HTTP410/409 또는 WS error 후1008. 다시 snapshot+globalPendingAck로 복구한다.

replay-live 경계는 hub subscribe+buffer를 먼저 설치 → 고정 high-water 획득 → 그 이하 replay → high-water 초과 buffer drain → live로 전환한다. 새 채널 tail seed도 이 경계와 조정해 seed 전후 이벤트를 건너뛰지 않는다. batch 256, incomplete면 replay frame 뒤 재구독; 연결별 mailbox 256, buffered bytes 1MiB 초과는 1013. fact/control 지시를 드롭하지 않는다(도메인 중요 알림은 kind=fact). client eventId dedupe, stream별 sequence 정렬; 다른 stream sequence끼리 대소를 비교하지 않는다.

SSE `GET /v1/stream?subscription=<id>&cursor=<opaque>`는 session cookie 또는 bearer 인증, Last-Event-ID=동일 immutable cursor. `event:frame`, `id:<cursor>`, `data:<ChannelServerFrame JSON>\n\n`; 15초 `: heartbeat\n\n`, 캐시 금지. receipt는 HTTP API로 보낸다. SSE가 WS와 다른 PENDING/route 구현을 갖지 않는다. 무한히 느린 consumer는 종료하고 last received cursor로 재연결한다.

처리 cursor는 전송 cursor와 별개다. GET/stream/peek는 절대 processed를 만들지 않는다. 사용자가 ACK/답 게시 또는 무시 이유 기록을 한 delivery들에 대해서만 `/inbox/process`를 호출하고, alias ordinal의 연속 처리 prefix를 서버가 계산한다. directive는 ACK 없이 ignored로 지울 수 없다. 우선순위로 정렬된 화면 마지막 행을 시간 커서로 삼지 않는다. 높은 ordinal을 먼저 ACK해도 낮은 미처리 항목을 넘지 않는다.

### 5.5 상주 세션 없는 pull과 깨우기 어댑터

`GET /v1/inbox?repo=o/r&issues=1,2&sinceCompact=true&cursor=<uuid>&limit=100`은 alias inbox의 snapshot high-water와 page token을 반환한다. 저장 순서는 `(alias,ordinal)`, API는 원래 위치를 유지하면서 `priority:ME|CC|ALL|OTHER`를 붙이고 CLI가 PENDING→ME→CC→ALL→OTHER로 표시한다. max page 500, `nextCursor`는 읽기 pagination token이며 처리 cursor 아님. 늦게 route된 작은 commentId도 새 ordinal이므로 다음 페이지/재조회에서 놓치지 않는다. board는 issue body BOARD와 explicit --board 합집합으로 포함한다. 기본 sinceCompact=true, 명시 `sinceCompact=false`/`--all-history`로 전체 조회 가능하다. --show는 접힌 원문 단건 API다.

**최초 pull/bootstrap 병합 계약(P1-2):** cursor 없는 첫 조회, scope 변경, cursor 만료 후 복구는 구독 여부·alias 생성시각과 무관하게 다음 builder를 실행한다. 이전 ALL에 대한 delivery를 신규 alias에 소급 생성하지 않는다.

1. repo 접근 권한을 검사하고 issues+반복 board+본문 BOARD를 `(repoId,issueNumber)`로 dedupe한다. REPEATABLE READ의 한 snapshot에서 issue별 최신 유효 COMPACT `C`, 최대 commentId `H`, canonical event stream별 high-water, token alias inbox 최대 ordinal `A`, token alias 채널의 event sequence high-water `E`(없으면 `"0"`)를 고정한다. cursor는 principal/alias/sid/정렬 scope/meAliases/sinceCompact에 결합한다.
2. canonical 집합은 issue마다 `[C,H]`(C 포함), C가 없으면 처음부터 H까지다. sinceCompact=false면 전체다. 이 집합은 가입 전 댓글과 ALL도 포함하며 own FROM 제외·ME/CC/ALL/OTHER는 합집합을 만든 뒤 적용한다. COMPACT는 별도 `compact` 필드에 전문을 반환해 작성자가 나여도 bootstrap 경계로 표시한다.
3. inbox 집합은 scope 안의 `ordinal<=A`이며, canonical 경계보다 오래돼도 미처리 delivery와 active HOLD/미종결 지시는 포함한다. 처리된 과거 delivery는 재표시하지 않는다. canonical 원문이 없는 compact.due/escalation 같은 알림도 inbox에서 포함한다. `pendingLegacy`는 inbox row가 아닌 원 issue 댓글 집합으로 계산하여 route 지연에도 맞는다.
4. 댓글 표시 키는 전역 `viewKey="comment:"+commentId`, comment 없는 알림은 `viewKey="fact:"+sourceEventId`다. canonical+inbox가 겹치면 댓글 1행에 optional `delivery:{id,ordinal,state,attempt}`를 붙이고 body는 canonical 원문을 사용한다. 서로 다른 stream의 eventId/sequence로 같은 댓글 행을 복제하지 않는다. 늦은 delivery는 기존 행에 덧붙이며 receipt/ACK/attempt 갱신을 버리지 않는다. 하나의 delivery 안의 재전송은 deliveryId+attempt로 처리한다.
5. pagination은 immutable snapshot의 id 목록·투영값·경계와 pending 배열을 서버 cursor snapshot에 고정하고 단일 DB tx를 페이지 사이에 열어두지 않는다. canonical tail은 issue별 commentId 오름차순, inbox 보완은 ordinal 오름차순으로 각각 위치를 보존한 뒤 viewKey로 합치고, CLI가 우선순위로 렌더한다. `compact`에 반환한 C는 items에서 중복 출력하지 않는다. 경계는 모든 페이지에서 그대로이며 중간 새 COMPACT가 과거 snapshot을 잘라내지 않는다.
6. 마지막 페이지는 `nextCursor:null`과 별도 `refreshCursor`를 준다. 후속 pull은 새 고정 snapshot의 H'/A'/E'까지 **① issue별 `H<id<=H'` canonical 사건, ② alias `A<ordinal<=A'` delivery, ③ alias 채널 `E<sequence<=E'` fact가 가리키는 기존 delivery 변경**의 합집합을 읽는다. source commentId<=H인 늦은 route는 ②로, commentId·ordinal 불변인 재전달/receipt/ACK/반영/정정은 ③으로 회수한다. P5는 모든 delivery attempt/state 변경에 같은 tx의 기존 alias fact(§4.3)를 남기며, internal overdue fact만으로 갱신을 대체하지 않는다. scope 밖 alias 사건도 E' 경계 계산에는 포함하되 항목 반환은 조회 scope·권한으로 필터한다. 새 COMPACT 감지 시 새 bootstrap snapshot으로 경계를 갱신한다. 순수 canonical 행은 deliveryId가 없으므로 receipt/processed cursor를 조작하지 않는다. 구독 생성이나 최초 watch만으로 processed를 만들지 않는다.

③은 처리 완료된 기존 delivery라도 변경을 반환한다. 변경된 deliveryId를 모아 새 snapshot의 최종 투영을 읽고 동일 viewKey에는 1행만 반환한다. `delivery`는 `{id,ordinal,state,attempt,aliasEventSequence}`이며 마지막 필드는 해당 delivery에 영향을 준 마지막 alias fact sequence(10진 문자열)다. P7은 deliveryId와 이 sequence로 upsert하여 같은 attempt의 상태 갱신도 반영하고, 중복/이전 snapshot 응답으로 최신 상태를 후퇴시키지 않는다. 페이지 도중 생긴 더 큰 sequence는 다음 refresh에서 회수하고, 모든 페이지 소비 전에는 기존 refreshCursor를 교체하지 않는다.

응답 공통 schema는 다음과 같다. `bootstrap`은 각 페이지에 항상 존재하고 `complete`는 bootstrap 페이지 전부를 소비했는지 뜻한다. `compact`는 scope의 issue별 배열(없으면 comment:null), `items`는 위 병합 항목이다. incremental 응답도 mode와 고정 경계를 명시한다.

```text
{bootstrap:{mode:"snapshot"|"incremental",snapshotId,meAliases,complete,
  issues:[{repoId,issueNumber,compactId,throughCommentId:H,eventHighWater}],
  inboxThroughOrdinal:A,inboxThroughEventSequence:E},
 compact:[{repoId,issueNumber,comment:{id,body,envelope}|null}],
 items:[{viewKey,commentId?,sourceEventId,sourceStreamId,sourceSequence,
   origin:"history"|"inbox"|"merged",priority,content,delivery?}],
 nextCursor,refreshCursor,processedCursor,pendingLegacy:{window,global},
 windowPendingAck,globalPendingAck,ackState,activeHolds,claims,handoffs,footers}
```

| 커서/경계 | 저장 내용·진전 조건 | 기존 delivery 변경 처리 |
| --- | --- | --- |
| `nextCursor` | 한 immutable snapshot의 페이지 위치와 H/A/E; 전체 페이지 완료 시 null | snapshot의 고정 투영을 반환, 페이지 사이 새 변경은 다음 refresh |
| `refreshCursor` | scope별 직전 완료 snapshot H/A/E; 후속 snapshot의 전체 페이지 소비 후 H'/A'/E'로 교체 | id·ordinal이 같아도 alias sequence가 E를 넘으면 회수. peek는 로컬 저장을 바꾸지 않음 |
| `processedCursor` | 근거가 확인된 alias ordinal 연속 prefix(§5.4) | refresh·attempt/state 수신과 독립, 읽기만으로 진전 없음 |
| transport cursor | §5.4의 stream별 수신 위치·불변 token | WS/SSE용이며 pull의 refreshCursor와 교환하지 않음 |

`I/comments`와 subscription bootstrap도 같은 history 경계·pending builder를 사용하고 자기 API의 single-issue shape만 다르다. I-13은 subscribe를 한번도 하지 않은 신규 Codex 별칭이 가입 이전 COMPACT+그 이후 ALL을 첫 watch에서 받는 결정적 시험이다.

history 항목의 source 3개는 원 `comment.posted` canonical fact를 commentId로 연결해 그 eventId/streamId/sequence로 채운다. inbox 병합 때는 delivery에 저장된 같은 좌표와 일치 검사하며 reaction envelope 좌표로 대체하지 않는다.

전송 재접속용 cursor, pull pagination cursor, 처리 cursor는 API 필드/파일 이름도 분리한다. Codex가 한 번 호출하고 종료해도 서버의 due/overdue는 계속 동작한다. CLI 상태는 기본 state 파일 안의 서버 URL+owner+alias+sid 및 조회 scope별 entry에 원자 저장하며 토큰과 함께 stdout에 출력하지 않는다.

```ts
interface WakeAdapter {
  kind: "webhook" | "command" | "claude-remote-trigger";
  wake(input: { deliveryId: string; alias: string; sid?: string;
    sourceCommentId?: string; attempt: number; idempotencyKey: string },
    signal: AbortSignal): Promise<{ accepted: boolean; externalReceipt?: string }>;
}
```

`packages/issus_domain/common/protocol/adapter/`가 wire 계약, app의 `src/server/adapters/<kind>/`가 구현이다. 기본 off, 허용된 alias→고정 endpoint/실행 파일의 관리자 설정만 사용한다. 게시 본문에서 shell/URL을 만들지 않는다. command adapter는 shell=false + argv, timeout5초, stdout body를 이벤트로 저장하지 않는다. webhook은 관리자 allowlist와 secret redaction, 재시도 키를 지원한다. RemoteTrigger 실제 연동/세션 깨우기 보장은 외부 제품 검증 전 미확인이고 1차 수용 기준에는 off 동작만 들어간다. off 상태의 push는 이미 연결된 세션으로의 스트림 전달을 뜻한다.

### 5.6 세션 깨우기 수단

다음 경로는 서버 delivery를 실행 중인 세션에 알리는 수단이다. 수신·transport receipt는 사용자 ACK나 작업 반영을 대신하지 않는다. 근거: DECISION 6310757267.

| 경로 | 동작과 경계 |
| --- | --- |
| Claude Code Monitor ws 소스 | ws 소스 `{url, protocols}`로 별칭 채널을 구독한다. 헤더를 넣을 수 없으므로 §5.3의 `issus.v1` + `issus.bearer.<token>`을 사용한다. 프레임1개=알림1개이며 30분 만료 때 재장전한다. 배포 뒤 실제 세션이 깨어나는 수용 확인은 오케스트레이터가 수행한다. 근거: DECISION 6310757267 (1)(2)(4) |
| 백그라운드 subscribe --once | `issus subscribe --once`를 백그라운드로 실행하고 프로세스 종료 알림으로 세션을 깨운다. 첫 delivery 수신·영수 완료 후 exit0, `--until <ms>`로 지정한 ACK-BY/idle 대기 만료는 exit3이다. 근거: DECISION 6310757267 (3)(4) |
| Codex | pull `issus watch`를 사용하거나 `subscribe --once`→`codex exec` 래퍼를 사용한다. 래퍼는 수신한 delivery를 후속 실행에 넘기며 실제 ACK/반영은 그 실행의 책임이다. 근거: DECISION 6310757267 (3)(4) |
| RemoteTrigger 어댑터 | off 유지. 실제 연결·세션 깨우기 보장은 미확인이다. Monitor/CLI 경로와 별도로 검증한다. 근거: DECISION 6310757267 (4) |

## 6. COMPACT 자동 유도와 패킷

**결정:** 요약문 생성은 OWNER/위임 worker가 맡고 서비스는 구간 계산·due 전달·패킷·강한 마커·본문 포인터 갱신을 책임진다. 자동 LLM 요약이나 요약 내용을 새 권위로 승격하지 않는다.

**근거:** 현재 스킬의 편향 없는 패킷 기반 요약을 유지하면서 누락된 의무는 서버 projection으로 보완한다. **대안:** 임계 도달 시 서버가 요약 없이 history를 잘라 버리는 동작은 금지한다.

### 6.1 통계와 due

최신 COMPACT **댓글 id 이후**의 모든 댓글 수와 원문 전체 code point 합(봉투·LF 포함)을 집계한다. COMPACT 자신의 자수는 새 구간에 포함하지 않는다. 일반 issue ≥25댓글 **또는** ≥40,000자, board ≥30댓글 **또는** ≥40,000자이면 due. `compact_segment` generation별 threshold due를 1회 발급하고 OWNER의 alias inbox로 `issus.compact.due`를 전달한다. 중복 reaction/재생으로 count를 ++하지 않고 sourceEventId unique 또는 원본 count 재계산을 쓴다.

DECISION/HANDOFF 준비 API·close 요청은 댓글 수와 무관하게 `reason=before-decision|before-handoff|before-close` due도 기록한다. COMMENT가 이미 들어온 뒤의 due는 소급 선행 완료로 쓰지 않는다. CLI `post --dry-run`은 due 정보를 함께 출력하고 게시 전에 packet 경로를 안내한다. ACK/HOLD/긴급 DECISION을 무조건 COMPACT 대기시키는 deadlock은 만들지 않는다. close만 §2.4의 신선한 COMPACT를 필수 gate로 둔다. OWNER는 DECISION/HANDOFF 전 요약을 만드는 것이 기본이며 긴급 생략은 `compactDeferredReason` 제출 metadata로 감사에 남긴다.

**before-close 접점:** P4 `closeIssue` 소유 경로가 P6 export `refreshCompactSegment(tx, issue, 'before-close')`를 closeIssue 호출 **전 별도 제어 tx**에서 실행·커밋한다. due는 관측 사실이므로 뒤의 close 검증 실패·close tx 롤백에도 기록을 보존한다. 무변경 preflight는 §3.2대로 계산만 하고 due를 기록하지 않는다. 근거: DECISION 6310243238 (3).

### 6.2 패킷·마스킹·동시 게시

`GET .../compact/packet`은 REPEATABLE READ snapshot에서 body 첫 줄+현재 본문(이전 COMPACT 없을 때), 이전 COMPACT 전체, 이후 댓글(id/created_at/envelope/body 오름차순), 통계, 제안 봉투, throughId, previousCompactId, snapshot revision, packetHash, opaque packetToken을 반환한다. 별도 `pendingAppendix`는 **pendingLegacy.window/global과 ackState를 각각 명명**하고 구간 밖 active HOLD/CLAIM/handoff id 및 원 id 조회 링크를 포함한다. 강화된 미ACK 목록을 기본 PENDING으로 합쳐 쓰지 않는다. 본문 편집·이관 수용/완료처럼 댓글이 아닌 제어 변경은 `controlFactsSinceCompact` 부록의 eventId/action/시각/변경값으로 넣는다. packet에 없는 것은 미확인으로 작성한다. packetToken은 owner/issue/prev/through/revision/hash에 결합된 DB record, TTL24h, raw secret 없음.

정본 `compact_prepare.py` MASKS 순서 그대로 pem→github-token→aws-key→api-key→bearer→password→email을 이식한다. 패턴은 source hash로 고정하고 `[MASKED:<kind>]`로 치환한다. PEM은 dotall private-key block, ghp/gho/ghu/ghs/ghr_/github_pat_, AKIA+16대문자숫자, sk-/xox*, bearer16+, password/passwd/secret/token/api_key assignment, email이다. 각 정규식의 경계·길이·case flag까지 golden fixture로 대조한다. **전체 조립 패킷에 다시 마스킹**하여 issue line1·댓글 제목에 중복된 봉투에서도 비밀이 새지 않게 한다(원본은 일부 메타 header가 별도라 보강). maskedCount는 최종 1회 패스 치환 수, 원문 char 통계와 마스킹 후 길이를 구별한다. CLI `--out`은 마스킹된 packet만 UTF-8 LF로 쓴다. raw token은 로깅하지 않는다.

OWNER는 ≤10댓글이면 직접, 더 길면 새로운 깨끗한 컨텍스트에 packet만 제공해 요약한다. 서비스가 외부 에이전트를 강제 기동하지 않는다. 작성 결과는 `TO:ALL TYPE:COMPACT [RE:<prev>] SEEN:<through>` + 2줄째 `## ===== COMPACT #<실제 issue> through <동일 SEEN> =====`, 전체≤2000자, 끝의 `compacted-by:<alias>`를 갖춘다. OWNER가 원 id≥3건(구간 3건 미만이면 전부) 표본 대조한 id 목록을 게시 metadata `sampledIds`에 제출한다. parser는 문구의 진실을 판정하지 않고 sample 존재·개수만 검사한다.

게시 tx가 issue lock 아래 packet prev/current pointer/마지막 댓글 id/revision을 다시 확인한다. snapshot 뒤 새 댓글이 생겨 `max(id)!=throughId`이거나 revision이 바뀌면 409 `COMPACT_STALE`이고 **댓글 게시 없음**, 새 packet을 받는다. 늦은 댓글이 COMPACT id 앞에 끼어 since-compact에서 유실되거나 본문/이관 변경이 빠지는 것을 막는 조건이다. 통과 시 COMPACT comment+comment.posted+compact.posted+issue body `COMPACT:<새 id>`/UPDATED/revision을 한 tx로 갱신한다. 첫 COMPACT는 RE 생략, 이후는 이전 COMPACT id가 RE에 반드시 포함돼야 한다. 수동 ≤10 경로도 packetToken을 발급받는다. empty tail이며 제어 변경도 없으면 packet API204, 요약 생성 불필요; close에는 직전 최종 REPORT와 제어 변경을 포함한 기존 summary가 있으면 사용 가능하다. 제어 변경만 있으면 기존 throughId를 유지한 packet을 발급한다.

기본 읽기는 COMPACT 원문+그 이후 댓글, 없으면 처음부터다. invalid marker/noenv는 경계 후보를 UI에서 강조하지만 native history를 잘라내는 정본 포인터로 채택하지 않는다. legacy read fixture에서는 watcher와 같이 봉투 TYPE 또는 강한 마커 둘 중 하나로 탐지하되 `validity:noenv` 경고와 globalPending을 유지한다. COMPACT는 저장된 댓글·이벤트·의무의 보존 기간을 줄이지 않는다.

### 6.3 댓글/COMPACT metadata 단일 schema(P0-3)

다음 표가 `POST I/comments` 요청→`issus.comment.post` 명령→저장 전 검사의 유일한 필드 정본이다. 요청 최상위 키는 `body,compactPacketToken,sampledIds,compactedBy,compactDeferredReason`만 허용한다. 명령 payload는 여기에 서버가 검증·각인한 `repoId,issueNumber` 및 공통 actor/idempotency를 더한다. `metadata:{...}`라는 요청 wrapper나 다른 철자/추가키는 422 `UNKNOWN_KEY`; 표 필드는 whitelist에서 누락시키지 않는다. 봉투 허용키에는 이 metadata 키를 추가하지 않는다.

| 요청 키 = 명령 키 | 타입·필수 조건 / 저장 전 검사 | 저장/재생 위치 |
| --- | --- | --- |
| `body` | 모든 댓글에 string 필수. 원문 byte 보존·§3 문법 검사 | comment.body, comment.posted.payload.body |
| `compactPacketToken` | COMPACT 필수, 다른 TYPE 금지. opaque string, owner/issue/prev/through/revision/hash/TTL·§6.2 stale 검사 | 토큰 해석 후 comment.metadata의 `compactPacketId,packetHash,previousCompactId,throughId,snapshotRevision`에 snapshot 증거 저장. raw token은 fact/공개응답/로그에 저장하지 않음 |
| `sampledIds` | COMPACT 필수 string[]; 중복 없는 숫자 id, packet tail 원 comment 안에 존재. tail≥3이면 ≥3건, 1–2면 전부, 제어 변경만 있는 tail0이면 [] 허용. 다른 TYPE 금지 | comment.metadata.sampledIds와 comment.posted/compact.posted.payload.metadata.sampledIds |
| `compactedBy` | COMPACT 필수, 같은 owner 등록 alias 문법·존재 검사. body 끝 `compacted-by:<alias>`와 정확히 일치. 논리 작성자 OWNER와 요약 worker는 달라도 됨. 다른 TYPE 금지 | comment.metadata.compactedBy와 두 posted fact의 metadata.compactedBy. 작성자 actor를 이 값으로 바꾸지 않음 |
| `compactDeferredReason` | DECISION/HANDOFF가 선행 COMPACT를 생략할 때 필수, 그 외 금지. 공백뿐이 아닌 string 1–500codepoints. 이유의 진실 여부를 자동 판정하지 않음 | comment.metadata.compactDeferredReason와 comment.posted.payload.metadata.compactDeferredReason. packet/control 감사에서도 조회 가능 |

일반 댓글 metadata 기본값은 `{}`이며 표의 선택키가 없으면 임의 null/빈 값으로 보충하지 않는다. COMPACT의 저장 metadata는 표의 해석된 packet 증거+sampledIds+compactedBy를 전부 갖고 compact.posted에도 같은 객체로 남긴다. `repoId,issueNumber,actor,idempotency`를 외부 요청이 지정하면 허용하지 않고 경로/인증에서 생성한다. 모든 허용 필드와 조건을 HTTP preflight·worker 최종검사·명령 decoder가 같은 parser로 검증한다. 어떤 단계도 unknown key를 조용히 버리지 않는다. command hash에는 모든 제출 metadata가 포함되어 같은 key의 표본/작성자/보류 사유 변경도 409다. CLI compact post와 일반 post는 이 경로만 사용한다.

## 7. HTTP/WS API·인증·헤드리스 UI

**결정:** 모든 API는 `/v1`, JSON UTF-8, 명령은 동일 제출 경로와 idempotency, 스트림은 읽기+receipt다. 1차 운영은 local single owner, bootstrap bearer로 alias/session을 발급하고 세션 bearer는 자기 alias만 쓴다.

**근거:** CLI의 파일 게시와 받은편지함을 일반 HTTP에서 사용할 수 있고 동일 서버가 push를 제공한다. **대안:** admin_domain 계정 서버를 함께 옮기는 것은 불필요한 인증·조직 의존을 가져오므로 제외한다.

### 7.1 인증과 공통 응답

배포 bootstrap은 CSPRNG 32byte 토큰을 최초 1회 생성해 운영자의 로컬 secret file(소스 밖 또는 gitignored docker/volumes 아래)에 제한 권한으로 저장한다. DB는 SHA-256 해시만, 배포 로그는 파일 경로만 출력한다. 실제 토큰을 defaults/docs/event/log에 넣지 않는다. `ISSUS_BOOTSTRAP_TOKEN_FILE`, `DATABASE_URL` 등은 secret 경로/환경 schema로 주입한다. 인증 principal은 kind=bootstrap 또는 session이며 §1의 alias/sid/sessionId는 session kind에서 필수다. bootstrap은 설정 owner에 한정한 관리 권한이며 사람 계정 시스템을 뜻하지 않는다. 세션 토큰은 API 발급 응답 1회만 반환, 기본24시간 만료, revoke 즉시 신규 쓰기/stream 재인증 차단. /s2 발급은 /s1 revoke를 함께 수행한다. 기존 연결은 로컬 revoke 즉시1008, 다른 broker에서는 최대15초 재검증 주기로1008이다. alias 이름을 안다고 토큰 없이 세션을 얻지 못한다.

HTTP Authorization Bearer, UI는 bootstrap이 만든 session token을 교환하는 `POST /v1/auth/browser-session`으로 HttpOnly SameSite=Strict cookie를 받고 메모리 bearer를 지운다. cookie는 TLS에서 Secure, local http에서는 loopback binding만 허용한다. cookie mutation은 동일 origin+CSRF token 검사. query에 장기 bearer 금지; browser WS는 cookie로 upgrade, CLI WS/SSE는 Authorization header. sessionStorage에 장기 bearer를 넣는 원본 BrokerClient 동작은 대체한다. access log는 URL query·Authorization·cookie·body를 기록하지 않는다. origin allowlist는 실제 배포 origin이며 wildcard CORS 없음.

모든 write는 `Idempotency-Key: <uuid>` 필수. **아래 세션 발급 예외 외에는** 같은 actor/key/canonical action+payload hash는 원 응답을 반환하고, 다른 payload는 409 `IDEMPOTENCY_CONFLICT`. canonical hash는 키 정렬 JSON, body 바이트는 정규화하지 않고 UTF-8 그대로(요청에 CRLF가 오면 그대로 검증; 저장 규칙은 LF 입력 권장)다. CLI가 실패 뒤 키를 새로 뽑지 않는다(아래 명시적 세션 재발급만 예외). 다른 key의 byte-identical 같은 issue/body/author 중복은 전체 이력에서 409 `DUPLICATE_COMMENT`와 기존 id 반환; 의미 변경은 SUPERSEDES를 포함한 새 본문으로 한다.

**세션 발급 멱등 예외(P1-c):** `POST /v1/sessions`는 접속 제어 서비스의 직접 tx로 token hash·session과 actor/key/action/payload hash·비밀 없는 발급 결과 metadata를 원자 저장한다. raw token은 최초 201 응답을 보내는 메모리에만 있으며 DB/command_result/operation/event/log에는 저장하지 않는다. 커밋된 동일 key·동일 payload 재시도는 원 201을 재생하지 않고 409 `SESSION_TOKEN_NOT_REPLAYABLE`, `details:{sessionId,alias,sid,expiresAt,reissueRequired:true}`를 반환한다(token 없음). 다른 payload는 공통 409 `IDEMPOTENCY_CONFLICT`; 커밋 전 실패·롤백이면 같은 key 재시도로 최초 발급을 완료할 수 있다. 재발급은 bootstrap 인증의 새 key로 **같은 alias·아직 쓰지 않은 새 sid**와 `reissueOf:<직전 sessionId>`를 명시한다(§2.1 unique(alias,sid) 유지). 서버는 대상이 해당 alias의 현재 미철회 세션인지 alias 잠금 아래 검사하고 old token revoke+새 session/token hash 저장을 한 tx로 수행하며 새 token도 응답 1회만 반환한다. 불일치/경합은 409 `SESSION_CONFLICT`; 새 발급 key의 응답도 유실되면 같은 복구 절차를 반복한다.

응답 유실 복구: **기존 key 그대로 재시도 → 409의 sessionId 확인 → bootstrap으로 새 key+reissueOf 명시 재발급 → 새 token을 제한 권한 profile에 저장**하며, 이전 token은 재사용하지 않는다.

문법·사전 권한 오류 422/401/403은 queue에 넣지 않는다. accepted는 202 `{operationId,status:"queued",statusUrl,posted:null}`이며 게시 완료 여부는 미확정이다. `Prefer:wait=5`면 서버가 최대5초 결과를 기다려 완료 시 201/200 또는 도메인 오류 409/422를 반환한다. 시간 만료는 같은 operation 202. 워커 재검사 오류는 operation의 `httpStatus,error,posted:false`에 저장된다. `/operations/:id` 자체 GET은 200이며 CLI가 그 도메인 상태를 exit code로 반영한다. 소켓으로 receipt 보냈다고 사용자 ACK comment를 대신 생성하지 않는다.

오류 공통 `{error:{code,message?,reasons?:[{code,path,message}],details?},posted:false,requestId}`. 400 JSON/형식, 401 token,403 권한,404 없음,409 상태/중복,410 cursor/packet expiry,412 revision,413 body>64KiB,422 규약,428 If-Match 없음,429 rate limit,503 DB/queue 준비 실패. 비밀·SQL·stack trace는 응답에 없음. max comment=4000 codepoint 이전에 HTTP 64KiB 상한이 적용된다.

### 7.2 API 표

아래 `R=/v1/repos/:owner/:repo`, `I=R/issues/:number`이며 실제 경로 확장은 예 `/v1/repos/hikaMaeng/issus/issues/1/comments`다. owner/slug는 path component로 encode; comment id는 전역 숫자지만 같은 owner 접근 검사를 한다. 페이지 limit 기본100/최대500. 목록은 closed 포함 여부를 명시할 수 있다.

| 메서드·경로 | 요청 예/핵심 입력 | 성공 응답 / 주요 오류 |
| --- | --- | --- |
| POST `/v1/repos` | `{owner:"hikaMaeng",slug:"issus",projectCode:"issus",autoBoard:true,boardOwner:"issus-board"}` bootstrap | 201 repo+board 또는202; 409 slug/code/alias 충돌 |
| GET `/v1/repos` / `R` | cursor?,limit? | `{items,nextCursor}` / repo detail |
| POST `R/issues` | `{title:"전달 구현",body:"STATE:queued OWNER:issus-1-orch UPDATED:...\nGOAL:..."}` | 201 `{number,revision:1}` 또는202; 422 body |
| GET `R/issues` | `?state=open&cursor=...` | issue summaries: number/title/state/isOpen/owner/compact/board/revision |
| GET `I` | — | `{issue,body,envelope,revision,stats,pendingLegacy,windowPendingAck,globalPendingAck,ackState,activeHolds,claims}` + ETag |
| PATCH `I/body` | `{body:"..."}` + If-Match | 200 revision/operation; 412 stale, 422 pointers |
| POST `I/comments` | §6.3 공통 요청 schema. 일반 ASK 예 `{body:"FROM:issus-1-orch/s1 TO:issus-1-review TYPE:ASK ACK-BY:...\nASK @issus-1-review: 검토.\nNEXT:..."}` | 201 `{commentId,eventId,revision}` 또는202; 422 봉투/metadata/unknown key, 409 duplicate/closed |
| GET `I/comments` | `?sinceCompact=true&cursor=...&limit=100` | `{compact,items,nextCursor,snapshot,pendingLegacy,windowPendingAck,globalPendingAck,ackState,stats}`; canonical history·경계는 §5.5 공통 builder |
| GET `R/comments/:id` | --show 경로 | `{id,body,envelope,metadata,author,createdAt,validity}`; 404 foreign id |
| POST `/v1/validate` | `{mode:"comment"\|"issue-body",body:"..."}` | 200 `{valid:true,chars,envelope}`; 422 reasons. 게시 없음 |
| POST `I/preflight` | bearer/cookie 인증, `{mode:"comment"\|"issue-body",request:{body,...}}`; comment의 request는 §6.3 허용키 전부, issue-body는 `{body}`만. issue-body는 실제 편집과 같은 If-Match 필수 | 200 `{valid:true,posted:false,mode,chars,envelope,context:{repoId,issueNumber,revision,checkedAt},compact:{due,reasons,count,chars,previousCompactId}}`; 아래 무변경·오류 계약. P4 소유·P7 사용 |
| POST `/v1/owners/:owner/aliases/check` | `{name:"issus-1-review",deep:true}` | `{available,collisions:[{kind,alias,evidence}]}`; malformed422 |
| POST `/v1/owners/:owner/aliases` | name,role,model,scope,repos,announcementIssue?,announcementBody | bootstrap 201 alias+ALIAS comment ids; 409 collision |
| POST `/v1/aliases/:id/rename` | newName,announcementBody | 200 alias/oldName; 409 collision |
| POST `/v1/sessions` | bootstrap `{alias:"issus-1-review",sid:"s1",resumeFrom?:"lastSeenId",reissueOf?:"session-uuid"}` + Idempotency-Key | 201 `{sessionId,token,expiresAt,alias,sid}` 최초 응답만. 동일 key 재시도409 SESSION_TOKEN_NOT_REPLAYABLE(§7.1), payload변경409 IDEMPOTENCY_CONFLICT, session/reissue 충돌409 SESSION_CONFLICT |
| DELETE `/v1/sessions/:id` | bootstrap or self | 200 revoked; stream close1008 |
| GET `/v1/auth/me` | bearer/cookie | principal+expiresAt（token 제외） |
| POST `/v1/auth/browser-session` | session bearer + same-origin | 200 csrfToken + cookie |
| POST `/v1/subscriptions` | `{channels:[],from:"since-compact"\|"start"\|"now",repo:"o/r",issues:[1]}` | 201 `{subscriptionId,channels,cursor,bootstrap,compact,pendingLegacy,windowPendingAck,globalPendingAck,ackState}`; §5.5와 동일 bootstrap builder |
| DELETE `/v1/subscriptions/:id` | self | 200 closed; 중복도200 |
| WS `/ws` | §5 프레임 | ready/subscribed/event/replay/error; HTTP401 handshake/1008/1013 |
| GET `/v1/stream` | subscription,cursor / Last-Event-ID | SSE frames; 403 scope, 410 cursor |
| GET `/v1/inbox` | repo,issues,반복 board,반복 me(§8),sinceCompact,cursor | §5.5 전체 응답: `{bootstrap,compact,items,nextCursor,refreshCursor,processedCursor,pendingLegacy,windowPendingAck,globalPendingAck,ackState,activeHolds,claims,handoffs,footers}`. 최초 pull에 canonical history 포함 |
| POST `/v1/deliveries/receipts` | `{deliveryIds:["..."],attempts:[0],subscriptionId?}` | 200 receipt ids /202; id ownership403 |
| POST `/v1/deliveries/:id/application` | evidenceCommentId,outcome,reason? | 200 applied/rejected /202; 409 ACK_REQUIRED, 422 unrelated evidence |
| POST `/v1/inbox/process` | deliveryIds,disposition,evidenceCommentId?,reason? | 200 `{processedCursor,lastSeenCommentId}`; 409 unacked gap |
| GET `I/compact/status` | — | `{previousCompactId,count,chars,due,reasons,owner}` |
| POST `I/compact/prepare` | `{purpose:"routine"\|"before-decision"\|"before-handoff"\|"before-close"}` | due 기록+packet, 201; no tail204 |
| GET `I/compact/packet` | `?format=json\|markdown` | packet+token+hash/suggestedEnvelope;204 empty |
| POST `I/comments` (COMPACT / 긴급 생략) | §6.3 동일 schema. COMPACT `{body,compactPacketToken,sampledIds:["..."],compactedBy:"alias"}` / DECISION·HANDOFF 생략 `{body,compactDeferredReason:"이유"}` | 201 compact id+updatedBodyRevision 또는 일반 comment id;409 stale, 422 marker/metadata/unknown key |
| GET `R/board` | `?issue=1&userBoard=2` | `{number,state,via,evidence}`;404 none, 409 conflict/closed |
| POST `R/board/ensure` | boardOwner,body? | existing board200 or created201; closed409(reopen 명시) |
| POST `I/handoffs/:commentId/accept` / `/complete` | ackCommentId / expectedRevision | 200 operation/result;422 bad ACK, 409 pending |
| POST `I/close` / `I/reopen` | §2.4 + If-Match | 200 issue /202;409 blockers |
| GET `/v1/operations/:id` | own actor only | `{status,posted,httpStatus,response?,error?}` |
| GET `/health`, `/ready`, `/metrics` | metrics는 operator token | 200 live/200 ready/503 not ready; metrics 미설정404 |

JSON 예시의 날짜 `...`는 표 가독성용이며 문법 수용 예시는 §13 원문 fixture가 정본이다. API integration fixture에는 완전한 ISO 오프셋 값을 사용한다. stateful 권한은 세션 alias의 repo 멤버십·OWNER/감독·bootstrap capability를 기준으로 체크하고 프런트 disabled만 믿지 않는다.

`POST I/preflight`는 POST지만 읽기 전용 검사이므로 Idempotency-Key·operation을 요구/생성하지 않으며 202를 반환하지 않는다. 인증과 repo/issue 읽기·게시 또는 본문편집 권한을 먼저 검사한다. 요청 최상위는 `mode,request`만 허용하고 comment 모드의 request에는 실제 게시와 동일한 §6.3 parser를, issue-body 모드에는 본문편집 parser를 적용한다(`metadata:{...}`·외부 actor/현재시각·unknown key는 422). 문법+§3.2 문맥+해당 metadata/packet 검사를 전부 통과해야 valid=true다. `compact`는 현재 구간 임계 및 요청 TYPE의 before-decision/before-handoff를 계산한 결과이며 due row·packet 생성과 무관하다. 실패는 공통 오류 shape와 posted=false: 400 형식, 401 인증, 403 권한/FROM 불일치, 404 repo/issue/접근 가능한 참조 없음, 409 closed·상태·COMPACT_STALE·DUPLICATE_COMMENT, 410 packet 만료, 412 stale If-Match, 413 상한, 422 봉투·metadata·시간·참조 규약, 428 본문편집 If-Match 누락, 503 DB 준비 실패(공통 429도 적용). 원 게시 validator의 code/reasons/순서를 재사용한다. 인증/권한 실패에 issue 정보는 노출하지 않으며, 성공 진단 이후 실제 게시까지의 동시 변경은 다시 검사한다. P4의 I-P1은 성공·실패 모두 DB/queue 쓰기 0과 compact due 계산을 확인하고 P7이 CLI 왕복을 확인한다.

완전한 게시 예시는 아래와 같다. 시험 전제는 서버 시계 `2026-10-21T04:00:00Z`, 등록된 두 별칭과 열린 #1이며 bearer는 실행 환경에서 주입한다.

```http
POST /v1/repos/hikaMaeng/issus/issues/1/comments
Authorization: Bearer <session-token>
Content-Type: application/json
Idempotency-Key: 60c2b874-757c-45e3-86f1-a14b915ed7e1
Prefer: wait=5

{"body":"FROM:issus-1-orch/s1 TO:issus-1-review TYPE:ASK ACK-BY:2026-10-21T13:10+09:00\nASK @issus-1-review: 설계 v2를 검토해 주세요.\nNEXT: ACK 확인 뒤 검토 결과를 기다립니다.\n---\n근거: docs/design.md"}
```

```json
{"commentId":"1000001","eventId":"5551ab89-6a11-49ad-a43d-a28c4e82ed21","revision":4,"posted":true}
```

HTTP201은 영속 게시 완료다. 5초 안에 끝나지 않으면 HTTP202 `{"operationId":"095cc8cd-88fa-4300-a685-7b495e6bb8be","status":"queued","statusUrl":"/v1/operations/095cc8cd-88fa-4300-a685-7b495e6bb8be","posted":null}`이다. posted는 true=영속게시, false=최종거부, null=미확정으로 구분한다. 최종 validation 실패는 HTTP422/operation httpStatus422와 §3 reasons를 반환한다. ACK 요청은 같은 endpoint에 `{"body":"FROM:issus-1-review/s1 TO:issus-1-orch TYPE:ACK RE:1000001\n수용. 설계 v2 검토를 시작합니다.\n---\n근거: 1000001"}`를 새 key로 게시한다.

### 7.3 최소 UI와 semantic markup 계약

Vite React 프런트, Express가 production dist를 같은 origin으로 제공한다. 페이지 `/repos`, `/repos/:owner/:repo/issues`, `/repos/:owner/:repo/issues/:n`, `/inbox`. 기능: 목록 필터, 본문 봉투/상태/OWNER, 댓글 봉투 필드·원문, 우선순위 inbox, COMPACT 이전 접기, noenv 경고, 작성/검사/게시, ACK 작성, 이관·닫기 오류 이유. 초기 UI는 한국어, 카피는 모듈별 resource map으로 분리한다. raw Markdown HTML은 실행하지 않고 sanitize된 렌더 또는 plain text pre를 사용한다.

| 영역 | 고정 locator 계약 | 상태/행동 |
| --- | --- | --- |
| 각 페이지 | `main` 1개, `h1` 유일; `nav aria-label="주 탐색"` | 로딩 `role=status`+aria-busy, 오류 role=alert, 빈 목록 문구 |
| 이슈 목록 | `table aria-label="이슈 목록"`, row `data-testid="issue-row" data-issue-number` | row 범위에서 `link name="#1 ..."`; nth/DOM 깊이 금지 |
| 본문 | `region aria-label="이슈 현재 상태"`, `dl` 봉투 | STATE/OWNER/UPDATED/COMPACT/BOARD 이름·값이 텍스트로 노출 |
| 댓글 | `ol aria-label="댓글"`, 각 `article aria-label="댓글 <id>" data-testid="comment" data-comment-id` | 봉투 `dl`, `time datetime`, 원문 details/summary `원문 보기` |
| COMPACT | `heading level=2` 실제 강한 마커; `data-testid="compact-marker"` | 색만 쓰지 않고 "구간 요약" 문구+marker, 앞부분 접힘 상태 aria-expanded |
| NOENV | 댓글 내부 `role=alert` 텍스트 `[NOENV] 봉투가 없어 실행할 수 없습니다` | valid native 게시에서는 생성 불가, legacy read fixture로 경고 시험 |
| 작성 | `form aria-label="댓글 작성"`, textarea label `댓글 본문`, button `검사`, `게시` | 검증 사유 role=alert, invalid aria-describedby; 성공 role=status `댓글 <id> 게시됨` |
| inbox | `region aria-label="받은편지함"`, item `data-testid="delivery" data-delivery-id` | ME/CC/ALL/OTHER, posted/delivered/acked/applied를 텍스트로 구별 |
| 처리 | item 안 button `수신 확인 작성`, `무시 사유 기록`; dialog의 고유 이름 | ACK 작성 전 미리보기, directive ignore 비활성 이유 |
| 닫기 | button `이슈 닫기`, dialog name `이슈 닫기 확인`, button `닫기 실행` | blockers id 목록 role=alert, 성공 상태를 긍정 문구로 노출 |

CSS 클래스/XPath/`.first()`/`.nth()`가 주 locator가 되는 구조를 만들지 않는다. 반복 control은 article/row로 scope한다. 테스트용 NOENV 레코드는 production import endpoint를 만드는 대신 read-route fixture adapter를 test 모드에서만 주입한다. Playwright는 운영 배포 dist에 같은 legacy read model fixture를 넣는 격리 시험 DB로 검증한다.

## 8. CLI `issus`와 기존 스킬 대응

**결정:** Node/TypeScript ESM app `apps/cli`, npm package name `@issus/cli`, `bin:{"issus":"dist/index.js"}`. self-contained node24 bundle, shebang과 Windows npm shim을 제공한다. 초기 설치는 로컬 `npm install -g ./apps/cli` 또는 `npm exec --workspace @issus/cli -- issus ...`; registry 공개 배포는 후속이다.

**근거:** 모노레포와 검증 타입을 공유하고 사용자 스크립트 인자를 대부분 그대로 옮긴다. **대안:** Python CLI 유지안은 TS 검증기와 오류 규약을 두 언어에서 관리하므로 선택하지 않는다.

다음 표의 E=공통 exit 계약(성공0/규약·도메인 거부1/사용법·연결·인증·서버·파일 오류2/미처리·timeout3)이다. 필수 옵션 누락·비반복 옵션 중복은2이며 마지막 값으로 덮어쓰지 않는다. `반복 예`는 argparse append와 같은 누적이다. 정본의 기본값과 바뀌는 곳은 차이를 명시한다.

| 원 스크립트/옵션 → issus 명령 | 필수성 | 반복 가능 | 기본값 | 정규화·의미/차이 | exit |
| --- | --- | --- | --- | --- | --- |
| issue_post → `issus post` `--repo` | 필수 | 아니오 | 없음 | o/r 두 path component. GitHub 자동 미러 없음 | E |
| post `--issue` | 필수 | 아니오 | 없음 | 숫자 N, URL/ref는 아래 공통 규칙 | E |
| post `--body-file` | 필수 | 아니오 | 없음 | cwd 기준 절대경로 해석, UTF-8 원문/BOM 보존 검사. 검증→key 저장→완료 대기 | E |
| post `--edit-body` | 선택 | 아니오 | false | body 편집, 최신 revision GET+If-Match;412 자동 overwrite 금지 | E(412=1) |
| post `--dry-run` | 선택 | 아니오 | false | local 문법 검사 뒤 인증된 POST I/preflight(mode=comment, request=실제 본문+§6.3 metadata). --edit-body는 mode=issue-body와 최신 If-Match. checkedAt·compact due 출력, DB 변경/게시/큐 생성 없음. P4 제공·P7 사용 | E |
| post `--timeout` | 선택 | 아니오 | 60s | 양수 duration, operation id/key 보존 후 재시도 | 완료0/거부1/장애2/대기만료3 |
| issue_watch → `issus watch` `ISSUE...` | --show 없으면 ≥1 | 위치 인자 복수 | 없음 | N 또는 o/r#N·서비스 URL; scope dedupe | E |
| watch `--repo` | 숫자 ISSUE 또는 --show이면 필수 | 아니오 | 빈 문자열 | 전체 ref만이면 생략 가능 | E |
| watch `--me ALIAS` | 선택 | **예** | --me/--mine 모두 없으면 token alias | 각 값 lower, 중복 제거. slash·sid 제거 안 함. 등록/접근 검사와 복수 별칭 규칙은 아래 | E |
| watch `--mine TEXT` | 선택, 레거시 호환 | **예** | [] | strip→선두 `작성:` 제거→첫 `\|` 이전→첫 `/` 이전→strip/lower. 비어 있으면 무시, --me와 합집합 | E |
| watch `--state FILE` | 선택 | 아니오 | **cwd의 `issue_watch.state.json`** | 명시 상대경로도 cwd 기준. 아래 scope key별 cursor 저장; 토큰 저장 안 함 | E |
| watch `--limit N` | 선택 | 아니오 | 4000 | 표시 본문 codepoint 상한, 양수. 페이지 크기와 무관 | E |
| watch `--full` | 선택 | 아니오 | false | OTHER도 전문(표시 상한은 limit), 분류/pending 불변 | E |
| watch `--peek` | 선택 | 아니오 | false | 읽기만, 상태 파일/processed cursor 전진 없음 | 성공0, pending 표시만으로3 안 함 |
| watch `--since-compact` | 선택 | 아니오 | **true** | Python 원본 false에서 native 기본 true로 변경(brief). 명시 플래그는 유지 | E |
| watch `--all-history` | 선택 | 아니오 | false | sinceCompact=false, --since-compact와 동시 지정2 | E |
| watch `--compact-due` | 선택 | 아니오 | false | footers+COMPACT-DUE+OWNER. 요약 생성 안 함 | E |
| watch `--board ISSUE` | 선택 | **예** | [] | issue parser 적용, 본문 BOARD와 합집합, `(repo,number)` dedupe, native registry 충돌1 | E |
| watch `--show ID` | 선택, ISSUE 생략 가능 | 아니오 | 빈 문자열 | 숫자 comment 단건 원문, --repo 필수. 상태 파일 변경 없음 | E |
| watch `--page-size N` | 선택 | 아니오 | 100 | 정수1–500, 내부 API page limit | E |
| watch `--processed-file FILE` | 선택 | 아니오 | 없음 | UTF-8 JSON delivery id+처리 증거. 대화형 확인 대안; 읽기만으로 전진 금지 | 증거없는 nonTTY3, 파일오류2 |
| compact_prepare → `issus compact prepare` `--repo` | 필수 | 아니오 | 없음 | o/r 형식, masked packet만 생성 | E |
| compact prepare `--issue` | 필수 | 아니오 | 없음 | 숫자 N 또는 서비스 ref. packet 경계 결정 | E |
| compact prepare `--out FILE` | **선택** | 아니오 | **`compact_packet_<owner>_<repo>_<n>_<last-id>.md` (cwd)** | 원본 `repo.replace('/','_')` 파일명 그대로, last-id는 tail 마지막 id(제어변경-only는 throughId). UTF-8 LF·masked packet, 동명 `.meta.json` sidecar 별도 저장 | 생성0/**empty204는1**/장애2 |
| `issus compact post` `--repo --issue --body-file` | 각 필수 | 각 아니오 | 없음 | post와 같은 파서·경로. compact status도 repo/issue 필수 | E |
| compact post 또는 post COMPACT `--packet-file FILE` | COMPACT에 필수 | 아니오 | 없음 | sidecar의 packetToken을 §6.3 compactPacketToken으로 전달 | E |
| compact post 또는 post COMPACT `--sampled id,id,...` | COMPACT에 필수 | 아니오 | 없음 | 숫자 목록→중복 없는 string[] sampledIds, 표본 개수/존재는 서버 검사 | E |
| compact post 또는 post COMPACT `--compacted-by ALIAS` | COMPACT에 필수 | 아니오 | 없음 | §6.3 compactedBy. footer와 정확 일치, FROM 대체 금지 | E |
| post `--compact-deferred-reason TEXT` | 선행 요약 생략 DECISION/HANDOFF에 필수 | 아니오 | 없음 | §6.3 compactDeferredReason, 봉투 키로 넣지 않음 | E |
| alias_check → `issus alias check` `ALIAS` | 위치 인자 필수 | 아니오 | 없음 | 원문 regex 검사, 자동교정 없음 | available0/conflict1/장애2 |
| alias check `--owner` | 필수 | 아니오 | 없음 | owner 범위 전체 레지스트리 | E |
| alias check `--deep` | 선택 | 아니오 | false | 호환 입력, 서버는 값과 무관하게 near 전수검사 | E |
| alias check `--repos o/r,o/r` | 선택 | 아니오 | 빈 문자열=owner 전체 | comma 분리+빈 값 제거+dedupe, evidence 출력 필터일 뿐 충돌 검사 축소 안 함 | E |
| alias check `--limit N` | 선택 | 아니오 | 60 | 양수 repo evidence 출력 한도, 서버 검사 전수라고 명시 | E |
| board_find → `issus board find` `--repo` | 필수 | 아니오 | 없음 | o/r 형식, 5단계 evidence·registry 대조 | open0/없음1/장애2/closed-only3 |
| board find `--issue` | 선택 | 아니오 | 빈 문자열 | 주 이슈 BOARD 발견용, 없음이면 그 단계 생략 | 같은 board exit |
| board find `--user-board N` | 선택 | 아니오 | 빈 문자열 | 숫자 사용자 지정 우선, native registry와 상충1 | 같은 board exit |
| subscribe `--repo --issue` | 각 필수 | 각 아니오 | 없음 | stream+receipt. --board는 반복 가능(기본[]), --since-compact 기본true | E |
| subscribe `--me` | 선택 | 아니오 | token alias | 구독/receipt는 단일 인증 alias만. watch의 복수 관찰 집합과 구분 | E |
| subscribe `--transport` | 선택 | 아니오 | ws | ws 또는 sse만 | E |
| subscribe `--cursor FILE` / `--once` | 각 선택 | 각 아니오 | cursor는 profile의 scope별 파일 / once=false | 마지막 수신 transport cursor 저장. once는 첫 delivery 수신·영수 완료 후 종료하며 ready/subscribed/replay 완료만으로 종료하지 않음. 근거: DECISION 6310757267 (3) | 첫 delivery 수신·영수 후0, 대기 만료3, 오류는 E |
| subscribe `--until <ms>` | 선택 | 아니오 | 생략 시 명시적 대기 상한 없음 | ms 단위 대기 제한으로 ACK-BY/idle timeout을 지정. --once도 이 상한 적용. 근거: DECISION 6310757267 (3) | 만료3 |
| alias register `--owner --repo --name --role --model --scope` / `--sid` | 앞6개 필수 / sid 선택 | 각 아니오 | sid 없음 | bootstrap 권한. announcement+registry tx, sid 지정 시 등록 뒤 session open | E |
| alias rename `--name`; board ensure `--owner` | 각 필수 | 각 아니오 | 없음 | 현재 alias 개명 / 명시 board 생성. 권한·충돌 검사 | E |
| session open `--alias --sid`; auth set `--server --token-stdin` | 각 필수 | 각 아니오 | 없음 | bootstrap 발급/표준입력. profile 사용자 전용권한, stdout token fallback 없음. 발급 응답 유실은 기존 key로 확인 후 §7.1 명시적 재발급 | E |
| session open `--reissue-of ID` | 재발급 시 필수 | 아니오 | 없음 | bootstrap+같은 alias의 직전 sessionId, 미사용 새 sid·새 발급 key 사용. 기존 key 재시도와 구분, old token revoke+새 token 1회 저장 | E(재생불가/충돌=1) |
| handoff accept/complete, issue close/reopen | API의 id/acceptance/revision 필수 | 각 아니오 | 없음 | 구조화 gate, §2.4·§7.2 필드 그대로 | E |

**복수 --me/--mine와 단일 token:** 정규화된 합집합 M이 비면 token alias 1개를 쓴다. 명시 M에는 token alias가 반드시 있어야 하며, 추가 별칭은 같은 owner의 등록 별칭이고 해당 repo canonical history 읽기 권한이 있어야 한다. GET inbox의 반복 `me` query는 이 **관찰·분류 집합**이다. 서버가 M 전체에 대해 canonical 댓글의 FROM/TO/mention·pendingLegacy를 정본과 같이 계산하되, alias inbox·ackState·receipt·process·서명/쓰기는 token alias 하나에만 귀속한다. 다른 별칭의 delivery cursor를 읽거나 전진시키는 권한으로 해석하지 않는다. 구독에서는 me=token alias만 허용한다. 이로써 복수 me/mine을 단일 값으로 덮거나 몰래 token을 바꾸지 않는다.

예: `issus watch --repo hikaMaeng/issus --me issus-1-design --mine '작성: issus-1-review / s2 | review' --board 2 --board hikaMaeng/issus#2 --since-compact --peek 1`은 design token으로 M={design,review}를 관찰하고 board2를 1번 읽는다. subscribe 없이 §5.5 bootstrap을 사용한다. peek의 pending 표시는 exit0이고 모든 cursor는 불변이다.

repo 이슈 인자는 `N`, `owner/repo#N`, 서비스 issue URL을 해석한다. GitHub URL은 이번 서비스의 데이터가 아니므로 자동 연결/동기화하지 않고 unsupported source를 명확히 출력한다. `--server` 또는 `ISSUS_SERVER_URL`, bearer 파일 경로/표준입력, `--json`, `--no-color` 공통 옵션. TLS 인증검증은 기본 on. 토큰 파일 쓰기 권한 실패 시 토큰을 stdout으로 fallback하지 않고 오류다.

출력은 기존 `[ME] [CC] [ALL] [OTHER] [NOENV]`, 이슈별 `state body-STATE reply-in last-id compact since-compact=<count>c/<chars> board`, COMPACT-DUE, PENDING-ACK, unread 집계를 유지한다. PENDING-ACK=windowPendingAck와 추가 PENDING-ACK-GLOBAL=globalPendingAck 모두 §5.2 **호환 집합**이다. 기본 순서는 PENDING-ACK→PENDING-ACK-GLOBAL(구간밖 표기)→ME→CC→ALL→OTHER, ACK-STATE는 별도 요청 상세/지표이며 PENDING의 대체 경고가 아니다. `last-id`는 원본처럼 이번 읽기 snapshot의 최대 comment id(SEEN용)이며 받은 마지막 event sequence나 처리완료 보장이 아니다. 처리 근거가 확인된 위치는 별도 processedCursor/lastProcessedCommentId다. 상태 파일의 key는 server URL+owner+token alias+sid+정렬 repo/issues/boards+M+sinceCompact이며 received transport cursor/pagination/refreshCursor/processedCursor를 서로 다른 키로 저장한다. 기본 파일 위치는 위 표대로 cwd이고 파일 안에서 scope를 분리한다.

exit:0 성공,1 규약/도메인 거부,2 사용법·네트워크·인증/서버 장애,3 미처리/timeout(예외: `board find`는 원본대로 closed-only=3, none=1; alias conflict=1). HTTP/operation 오류의 한국어 사유를 순서대로 출력한다. Ctrl-C는 subscription만 닫고 ACK·적용·완료를 조작하지 않는다. 파일 쓰기는 UTF-8(no BOM), LF, 원자 rename; Windows 이름·한글 경로 회귀 시험을 포함한다.

## 9. 모노레포 구조·빌드·운영

**결정:** npm workspaces+Turbo, libs는 packages, 서비스 모듈은 apps다. 변화 이유가 다른 관심사는 작아도 폴더를 나누고, role 간 공유는 backend/common 아래로 내린다. 루트 wiring을 기능 구현자가 함께 편집하지 않는다.

**근거:** 원본의 폴더 경계 원칙을 살리고 compose module당 container 규칙을 동시에 충족한다. **대안:** apps/issus 하나에 모든 container/handler/UI/CLI를 넣는 방식은 배포·변경 경계를 합치므로 배제한다.

```text
package.json                 # private issus-root; workspaces apps/*, packages/*
package-lock.json            # npm lock 하나, exact versions
turbo.json / tsconfig.json / .npmrc / .dockerignore / .gitignore
scripts/{deploy.sh,dependency-fingerprint.sh,node-range.mjs,run-tests.mjs}
docker-compose.yml           # name: issus, 유일 compose
docs/{brief,design,vendoring,overview,architecture,api,usage,constraints,internals,testing}.md
packages/
  agent/                     # 이름 agent; vendor·인증/커서 확장; 독립 build/docs/test
  issus_domain/              # 이름 issus_domain, version 0.1.0
    src/common/protocol/{repo,issue,comment,envelope,alias,session,delivery,
                         subscription,compact,board,handoff,inbox,adapter,runtime}/
    src/common/validation/{comment,issue-body,alias,time}/
    src/common/logic/{classification,pending-ack,delivery-state,compact-stats,masking}/
    src/server/backend/{schema,event-uow,command-result,repository,authorization}/
    src/server/intake/{repo,issue,comment,alias,board,handoff,closing}/
    src/server/routing/{recipients,notifications}/
    src/server/delivery/{receipt,ack,application,processing,retry}/
    src/server/compact/{segment,packet,publication}/
    src/server/scheduling/{deadline,tick,escalation}/
    src/front/{client,model}/ # 환경 독립 모델, React import 없음
    tests/fixtures/issue-board-v2/{good,bad,flows,manifest.json,golden-errors.json}
    README.md / docs/{overview,architecture,api,usage,constraints,internals,testing}.md
  issus_runtime/             # 이름 issus_runtime; broker/worker/scheduler 공통 주입·기동
    src/server/{config,auth,migrations,health,worker-bindings,scheduler-producer}/
    src/server/adapters/{disabled,webhook,command,claude-remote-trigger}/
    README.md / docs/...     # 프레임워크 독립; Express 서버 생성은 app 책임
apps/
  issus/
    src/server/entry/broker/ # 조립만 담당
    src/server/reactions/{queues,table}/
    src/server/http/{repo,issue,comment,validate,inbox,subscriptions,deliveries,compact,
                     alias,session,board,handoff,operations,auth}/
    src/server/stream/{sse,callbacks}/
    src/front/{entry,pages/{repos,issues,issue,inbox},features/{envelope,comment,
               compact,composer,delivery,closing},resources,styles}/
    docker/{Dockerfile,env.defaults,volumes/.gitkeep}
    README.md / docs/... / tests/{plans,reports,browser,integration}
  issus-worker/
    src/server/{entry,roles/{intake,routing,delivery,compact}}/
    docker/{Dockerfile,env.defaults,volumes/.gitkeep} / README.md / docs/...
  issus-scheduler/
    src/server/{entry,roles/tick}/
    docker/{Dockerfile,env.defaults,volumes/.gitkeep} / README.md / docs/...
  issus-db/
    docker/{Dockerfile,env.defaults,postgres/initdb/001-extensions.sql,volumes/.gitkeep}
    README.md / docs/...     # 인프라 서비스; 빈 front/server를 만들지 않음
  cli/
    src/{entry,commands/{post,watch,subscribe,compact,alias,board,session,issue,
                        handoff,auth,admin},client,profiles,output,state}/
    README.md / docs/... / tests/{plans,reports}
```

각 기능 폴더의 `index.ts`는 공개 경계, `logic.ts/types.ts/config.ts/*.test.ts`는 필요한 역할만 담는다. wire 타입을 server/front에 재선언하지 않는다. `packages`→`apps` import 금지, 패키지 간 workspace 이름만 사용, 런타임에서 해석할 수 없는 tsconfig 전용 alias 금지다. `issus_runtime`은 기동·인증 등 여러 app의 공통 연결만 맡는다. HTTP의 Express 의존은 app, 업무 규칙은 issus_domain에 둔다. 프레임워크가 필요한 agent의 Express/ws transport는 기존 vendor의 명시 예외로 docs에 기록하고 다른 라이브러리로 확대하지 않는다.

root scripts는 `build:"turbo run build"`, `test:"turbo run test"`, `lint:"turbo run lint"`, `deploy:"bash scripts/deploy.sh"`, `test:integration`, `test:browser`다. Turbo build는 dependsOn ^build/outputs dist/**, test는 dependsOn ^build+build/outputs 없음, integration/browser는 cache=false, 필요한 `ISSUS_TEST_DATABASE_URL`/`ISSUS_TEST_SERVER_URL`만 passThroughEnv로 전달한다. remote cache는 off다. 외부 의존은 구현 시작 때 공식 registry metadata에서 TS 최신 stable과 호환 Turbo/Vite/React/Express를 확인해 exact pin+package-lock으로 남긴다. 이번에는 최신 버전을 미확인했으므로 원본 버전을 latest로 표시하지 않는다. runtime은 `node:24-alpine`/esbuild target node24, @types/node는 24 major의 exact 버전, engines.node>=20이다(빌드 도구가 더 높은 최솟값을 요구하면 근거를 기록해 갱신).

### 9.1 배포와 환경

`npm run deploy`의 인자 없음은 제품의 4서비스 전부를 뜻한다. `npm run deploy -- issus`는 app과 필요한 dependency를 안전하게 갱신한다. 원본 deploy.sh의 install fingerprint, local build, compose config, port/health 검증, deploy-report를 재사용한다. 필요한 보조 script도 출처 manifest에 기록한다. 원본의 다른 project container를 docker rm -f하는 처리는 제거하고, 이름/포트 충돌 시 실패와 소유 project를 표시한다. 프로젝트 밖 데이터 청소·volume 삭제·docker system prune는 deploy에 넣지 않는다.

순서: 도구/Node range 확인→각 env.defaults에서 빠진 비밀 아닌 local 설정을 생성(기존 secret 덮어쓰기 금지)→lock 있으면 npm ci→Turbo로 전체 대상과 의존을 local build→dist manifest/hash→compose build(runtime COPY만)→db healthy→schema lock 아래 migration 완료→worker/scheduler/issus up→내부 health+host `/ready`+UI shell+실제 WS subscribe→report. worker dist 누락을 Docker runtime install로 보완하지 않는다. 최종 HEAD/dirty diff hash, image digest, bundle hash, 비밀을 제외한 설정 hash를 보고한다. current 판정은 shared packages를 포함한 dist hash와 env hash로 한다.

| 설정 | 초기값/검증 |
| --- | --- |
| ISSUS_HOST_PORT / ISSUS_PORT / PORT | 18140 후보, 환경값10000–59999; PORT는 ISSUS_PORT에서 주입, 충돌 검사 |
| ISSUS_DB_HOST_PORT | 15440 후보, 환경값10000–59999; loopback5432 mapping의 host 쪽 |
| DATABASE_URL | 필수, PG 연결 문자열; 로그 비표시 |
| ISSUS_BOOTSTRAP_TOKEN_FILE | 필수, operator secret mount read-only |
| ISSUS_OWNER / ISSUS_SUPERVISOR_ALIAS | owner 필수, 감독 alias 선택이지만 supervisor 운영 채널은 상설 |
| AGENT_QUEUE / worker queues | intake, route, delivery, compact, schedule; 코드의 queue 상수와 schema 대조 |
| QUEUE_VISIBILITY_TIMEOUT_SECONDS / AGENT_EXECUTION_LEASE_SECONDS | 60/120, 후자>전자 필수 |
| AGENT_DATABASE_POOL_MAX | 프로세스별4(queue pool도 최대4); broker 전용 LISTEN/lease 포함 DB 상한 계산 |
| ISSUS_EVENT_RETENTION_DAYS | null 고정(자동 삭제 없음), cursor TTL30일과 별개 |
| ISSUS_SCHEDULE_TICK_MS | 5000, 시험은 fake clock/명시적 test 설정만 |
| ISSUS_WAKE_ADAPTER | disabled, 선택 adapter 설정은 operator만 |
| ISSUS_ALLOWED_ORIGIN | 실제 loopback 공개 origin, wildcard 금지 |

Postgres max_connections=100에서 초기 broker/worker/scheduler pool 합24+LISTEN/lease/시험 여유를 확보한다. scale 전에 합계를 다시 계산한다. worker handler maxConcurrent 초기16, poll batch8, pollSeconds1, logTailPollMs1000, replay/mailbox256이다. 성능 측정 결과가 아니라 초기 운영 설정이다.

### 9.2 운영·감사·복구

event/comment는 append-only, 편집은 새 fact와 revision이다. 매일 pg_dump custom 형식과 volume/PG major/image tag를 외부에 backup한다. 복구는 격리 volume restore→migration→projection 대조→read/write+미ACK 재전달까지 시험한다. volume 복사만으로 복구 PASS를 선언하지 않는다. DB 로그에 raw secret을 출력하지 않고 에이전트에는 masked packet만 전달한다. comment에 저장된 기밀 삭제/암호키 폐기는 초기 제품 일반 API에 넣지 않고 operator incident로 범위를 정한다.

metrics: queue depth/oldest age, reaction cursor lag, **pendingLegacy.window.count/pendingLegacy.global.count/oldestLegacyOverdue와 ackState.waiting.count를 별도 이름으로**, delivery attempts/escalations, compactDue count, duplicate/rejected by code, WS active/reconnect/1013, DB pool wait, scheduler lastTick/lag, projection backlog. 재알림 지표는 pendingLegacy.global만 입력이고 ackState 지표로 대체하지 않는다. 로그에는 requestId/operationId/eventId/sourceEventId/sourceStreamId/sourceSequence/commentId/deliveryId/aliasId/sid/attempt/state change만 남긴다. 본문이 필요한 조사는 인증된 단건 API로 수행하고 URL/결과 범위를 보고한다.

scheduler 정지>15초/overdue lag>15초, reaction lag>10초, 영구 처리 failure, DB unavailable이면 operator health=degraded다. `/health`는 생존만, `/ready`는 migration/queue/필수 loop 상태다. 종료는 ready503→producer 정지→consumer 신규 read 정지→진행 tx 완료→WS close 1001(Going Away)·SSE 종료→listener/pool close 순서다. O-01에서 WS 연결 중 SIGTERM을 보내 ready503·신규 read 중단·진행 tx 완료·클라이언트 close code=1001·종료 호출 예외0·제한시간 내 pool 종료를 확인한다. SIGKILL 뒤 PGMQ visibility와 command_result로 회복한다. 백그라운드 처리 성공과 외부 에이전트의 실제 작업 성공을 혼동하지 않는다.

## 10. 시험 계획과 증거

**결정:** 규약 golden 대조, 실제 Postgres+PGMQ 통합, 배포된 dist의 브라우저 시험을 필수로 한다. 단위 시험만으로 완료하지 않는다.

**근거:** 핵심 실패는 문법 밖의 HOLD 미수신·ACK 오판·재시작·cursor 경계에서 발생한다. **대안:** mocked event-store만 통과한 결과는 영속/전달 보장을 증명하지 못하므로 채택하지 않는다.

### 10.1 고정 수용 시험

| ID | 입력/실행 | 결정적 기대 결과 |
| --- | --- | --- |
| U-V1 | §13의 32 good/5 bad를 TS 함수와 HTTP `/validate`에 입력, Python 출력 golden과 대조 | 28comment+4body 전부 pass, 5bad 전부422, errors message/순서 일치, posted=false |
| U-V2 | BOM, unknown/중복키, STATE 다른TYPE, sid/proxy, emoji4000/4001, 윤일/무효일, ISO offset, ASK 복수, COMPACT marker 불일치 | 원 Python 성공/실패 일치. 원본 예외 입력도 server500 없이422 |
| U-A1 | exact/case/substring/치환/삽입/삭제/전치, 다른owner, 동시등록 | 같은owner near 거부, 다른owner 독립, 전치만으로는 dist1 아님; 동시등록1건만 성공 |
| U-R1 | TO/mention/CC/ALL/타인HOLD/DECISION/OTHER와 자기FROM | 우선ME→CC→ALL→OTHER, CC 단독ACK 없음, TO1 실행자, recipient 중복0 |
| U-D1 | 같은 issue의 ASK→내 REPORT RE, 다른 TYPE별 RE, 모든 작성자/TYPE의 SUPERSEDES read fixture, TO/mention/ownFROM·복수M·COMPACT 전후 구간을 Python과 대조 | pendingLegacy.window/global은 각 구간의 정본 결과와 일치. REPORT RE로 legacy 해소·ackState waiting 유지. 무권한 SUPERSEDES도 호환 표시 해소하나 실제 종결/HOLD해제는 불가 |
| U-D2 | NOTE 답 ACK·CLAIM 양보 ACK·제3자 지시 ACK·mention ACK·승인 proxy ACK·복수 RE·후속 ACK, 실제 TO ACK/receipt/apply 역순 | 모두 일반 게시 허용, 실제 TO의 직접 ACK만 delivered→acked(선행 receipt없으면 ack-evidence). 중복 상태 fact0, NOTE/CLAIM ACK가 가짜 지시 delivery 생성0, ACK로 HOLD해제0 |
| U-E1 | canonical fact F=(id,stream,seq)를 2개 큐에 fanout, queue→toEventDraft→store→worker, 재적재·재구축·누락 source metadata | react eventId는 큐별 다름. 원 source3개는 F와 동일, projection별1회/delivery별1건, malformed fallback0·큐 보존. 외부 provenance 지정 거부 |
| U-C1 | 24/25댓글, 39999/40000codepoints, board29/30, stats 중복, COMPACT reset | 경계due1건, board 임계 정확, fullbody 계산, 과거 의무 유지 |
| U-C2 | §6.3 요청 전 필드 HTTP→명령 decoder→저장 왕복, unknown/오탈자·누락·다른TYPE의 키·sample수·worker/footer불일치, 사유 hash 변경 | 표의 허용 필드 유실0, 금지/unknown422·게시0, 동일 key metadata변경409, 두 posted fact metadata=comment.metadata, raw packetToken fact노출0 |
| U-M1 | 각 MASKS 정례/반례, PEM 여러줄, header/line1 비밀 패턴, 순서 중복 | Python masked text 일치+패킷 전체 중복노출 방지, raw string 없음 |
| U-S1 | fake time ACK-BY 직전/직후, 3retry, 같은issue ACK/REPORT RE/tick 경합, COMPACT 이전 미해소, restart | 동일 source 새comment0; due unique, legacy 미해소 HOLD 즉시 escalation, REPORT RE 해소 후 ackState waiting이어도 retry/escalation0, window 밖 global pending은 재알림 유지 |
| I-V1 | good32 원본 바이트 유지, 별칭/권한/실제 참조/고정 Clock 문맥 준비. 댓글28 POST, 준비한 이슈의 본문4 교체(--edit-body); COMPACT id·REPLY-IN·BOARD 이슈 선행 생성 | 32개 모두 서버 검증 통과. 댓글28 완료201, issue-body-running/closing/cancelled·board-body 4개는 PUT/PATCH body 완료200. 신규 이슈 POST201로 본문 시험 대체 금지. 근거: DECISION 6310243238 (1) |
| I-01 | 실제DB, 가짜 session A/B 별칭 등록, B WS subscribe, A UI stream. Authorization 외 subprotocol 인증·잘못된 token·query token·타별칭 채널도 시도 | native token 인증, subscription.opened, ready→subscribed. issus.v1+issus.bearer.<token> 허용·응답은 issus.v1만, query token 거부·로그/fact 토큰노출0, 기본 별칭 필터·자족적 한 줄 delivery JSON. 근거: DECISION 6310757267 (1)(2) |
| I-02 | A→B ASK(완전한 ISO ACK-BY), 같은key 재송, 같은body 다른key, B receipt | comment1건/delivery1건, 같은key 기존결과, 다른key409, B ME 전문, A를 B 수신으로 간주하지 않음 |
| I-03 | B TYPE:ACK RE:<ASK>, 다음 REPORT+apply, 뒤늦은receipt | acked→applied, pending0, event/snapshot 일치 |
| I-04 | A→B HOLD, B 연결종료·미ACK 상태로 test clock 전진, 재접속 | overdue/redelivered/escalated, OWNER/감독 inbox, B 재생에서 같은HOLD id, receipt만으로 pending 소멸 불가 |
| I-05 | B ACK STATE:hold, A/B 각각 CLAIM 시도, DECISION SUPERSEDES 해제 뒤 ACK | 당사자B 실행시작은HOLD로 거부, 비당사자 오차단0, ACK만으로 해제 불가 |
| I-06 | 25건/40k 임계 각각 도달, OWNER packet→COMPACT, 동시 새comment로 stale 검사 | owner due, token/marker/through 검사, stale409, 성공 시 body pointer 원자 갱신, sinceCompact 누락0 |
| I-07 | 미ACK/미RELEASE/pending handoff 상태 close, 이후 수용ACK→handoff complete→최종REPORT/COMPACT→close. close 전 별도 제어 tx의 before-close due 기록 확인 | blockers id 반환, 무응답handoff 완료 불가, 최종close 성공, closed 새작업post409. close 실패·롤백에도 before-close due 보존. 근거: DECISION 6310243238 (3) |
| I-08 | broker/worker를 ①queue 저장 뒤 ②domain tx commit 전 ③commit 뒤/result 전에 정지·재시작 | comment/fact/의무 누락0, 논리중복0, cached 결과, 미완source 유지 |
| I-09 | reaction cursor 없음, 24h 넘은 미처리fact, 복수broker lease, projection rebuild | 처음부터 page 회수, lookback으로 오래된 의무 유실 없음, rebuild 후 동치 |
| I-10 | WS/SSE high-water/subscribe 경계에 barrier 게시, 256초과 재생, client 수신 전 연결단절 | cursor 재개 누락0, eventId 중복제거, 타alias 수신0, scope 위조403/1008 |
| I-11 | pull ME 우선표시, 뒤늦게 작은commentId route, --peek와 processed gap | 새ordinal로 노출, peek cursor 변경0, 미ACK를 처리cursor로 건너뛰지 못함 |
| I-12 | DB restart, scheduler 재시작, app recreate/backup restore, 30일 넘은 event | ready 정확, 영속행 소실0, 지연due 회수, history 자동prune0 |
| I-13 | 기존 이슈에 COMPACT C+이후 ALL N 게시→신규 별칭 B 등록→**subscribe 없이 CLI watch --peek** 첫 pull. 작은page로 병합 도중 새댓글/새COMPACT 게시, N의 delivery route 지연·재적재 | B는 이전 C 전문+N을 받음. bootstrap/compact/H/A 필드와 고정 경계 일치, history+inbox 댓글1행, 과거 ALL delivery 소급생성0. 다음 refresh에서 id>H 및 ordinal>A late N 회수·기존행 보강, 누락0·peek processed변경0 |
| I-14 | 실제DB에서 board NOTE 답 ACK, 주이슈 CLAIM 양보 ACK, A→B ASK 후 같은issue B REPORT RE, C의 제3자 ACK, B 직접 ACK. clock 전진·ACK 전 close 시도 | NOTE/CLAIM/제3자 ACK 게시 성공·지시 상태효력0. REPORT 후 read/inbox/watch legacy pending0·ackState waiting, 재전달/escalation0, close는 강화 상태로 차단. B 직접 ACK만 acked, 두 계산을 혼동하지 않음 |
| I-15 | P5/P7: subscribe 없는 B가 최초 pull 전체 페이지를 소비하여 H/A/E refreshCursor 저장. 새 댓글 없이 기존 일반 ASK delivery D만 기한 재전달 attempt1로 갱신한 뒤 작은 page로 refresh, 이후 receipt로 같은 attempt의 state만 갱신해 재조회 | commentId·ordinal·H/A 불변, E 증가. D 한 행의 attempt/state/aliasEventSequence 최신화, 중복행0·기존 source 유지. 페이지 중 추가 변경은 다음 refresh에서 회수, 동일 cursor 재조회 누락0·오래된 응답으로 후퇴0·processed 불변 |
| I-P1 | P4/P7: 유효 ASK·만료 ACK-BY·HOLD>10분·unknown metadata·COMPACT stale/만료·closed/duplicate·issue-body If-Match·미인증/타repo, 서버 Clock과 임계 due/DECISION/HANDOFF를 POST I/preflight 및 CLI --dry-run으로 검사 | 200의 checkedAt/compact due 정확, 오류 status/code/reasons는 실제 게시 검사와 동치. 성공·실패 모두 DB 전체 투영/revision/packet/due/cursor/command_result/event·PGMQ 차분0. preflight 뒤 상태 변경 시 실제 게시 재검사 |
| I-S1 | P4/P7: 세션 최초201 응답 유실, 동일 key·payload 재시도, 다른 payload 재시도, bootstrap 새 key+새 sid+reissueOf로 재발급, 경합 재발급 | 최초 token 1회·해시만 저장, 동일 key409 SESSION_TOKEN_NOT_REPLAYABLE와 비밀 없는 복구정보, payload변경409 IDEMPOTENCY_CONFLICT. 재발급 old token revoke·새 token1회·alias inbox 유지, 경합409 SESSION_CONFLICT, token의 DB/result/event/log 노출0 |
| I-S2 | browser-session 최초/동일 key 재시도 Set-Cookie 검사, 고정 Clock 주입 | token과 HttpOnly·SameSite·Path·Expires(Clock 기준) 필수 속성이 일치. Express 응답 시각에 기대값을 의존하지 않음. 근거: DECISION 6310243238 (4) |
| I-D1 | P5 소유 receipts/application HTTP: 미인증·타alias·중복receipt·receipt 전/후 ACK·무관 evidence·ACK없는 apply·유효 REPORT apply | 미인증401/타alias403, 중복receipt멱등·단조상태. ACK없는 apply409 ACK_REQUIRED/무관근거422, 유효근거 applied. 전용 시험 경로와 담당은 §11 |
| C-01 | CLI parser와 실제API: 반복 --me/--mine 합집합·반복 board dedupe, token alias 미포함, peek, state 생략/상대경로, compact --out 생략·empty, 한글경로·default limit | M/board 정본 일치, 추가alias canonical관찰만·타인cursor변경0. 기본 cwd/issue_watch.state.json의 scope격리, out 원본 파일명·masked text·sidecar, exit0/1/2/3 표와 일치 |
| C-02 | subscribe --once로 ready/subscribed 후 delivery 대기→첫 delivery 수신·receipt, 별도 실행에서 --until <ms> 만료 | 제어 프레임만으로 조기 종료0건, 첫 delivery 영수 후 exit0, 대기 만료 exit3, ACK/반영 자동생성0. 백그라운드 종료 알림 경로와 §5.6 Monitor 실제 깨우기는 배포 후 별도 관측. 근거: DECISION 6310757267 (3)(4) |
| B-01 | 배포web issue 목록→issue, envelope/COMPACT/NOENV read fixture | semantic locator strict, 문자/marker 시인성, NOENV를 유효게시로 오인하지 않음 |
| B-02 | textarea invalid ASK 검사·게시→유효ASK 게시→inbox ACK→reload | 422 reasons, invalid 댓글0, 성공id, 상태/재표시 동치 |
| B-03 | 오류·빈목록·loading·close blocked dialog, WS 단절/재연결 | status/alert/label로 판정, CSS/nth 의존0, 중복행0 |
| O-01 | clean 환경 `npm run deploy`, 반복deploy, port 충돌, 외부project와 같은container 이름, WS 연결 중 SIGTERM graceful shutdown(§9.2) | build 선행, COPY runtime, health+WS 성공, current 판정, 외부container 파괴0. 종료 시 ready503→신규 read 중단→진행 tx 완료→WS 1001·SSE 종료→pool 종료, 종료 호출 예외0·30초 내 종료 |

U는 단위, I는 실제DB/PGMQ 통합, B는 headless Playwright, O는 운영이다. 시간은 injectable Clock으로 주입하고, 통합에서는 test 전용 clock/SQL fixture로 단축한다. 제품의 HOLD≤10분 검증은 바꾸지 않는다. 필수 DB가 없으면 skip으로 통과시키지 않는다(exit nonzero/BLOCKED). 시험 DB는 `issus_test_<runid>`로 별도 volume에 두어 제품DB와 섞이지 않게 한다. 별도 compose override를 늘리지 않고 같은 root compose의 profile/env로 시험한다. 정지 대상은 issus project의 해당 container만 식별한다.

### 10.2 기록 형식과 완료 판정

구현 담당은 작성일을 고정한 `apps/issus/tests/plans/acceptance-20261021.md`, `packages/issus_domain/tests/plans/protocol-20261021.md`, `apps/cli/tests/plans/compatibility-20261021.md`를 먼저 만든다. 절은 Created/Goal/Environment/Preconditions/Steps/Expected Results/Logs To Capture/Locator Contract다. 시험ID·조작·expected를 먼저 고정한다.

실행 기록은 모듈별 `tests/reports/<name>/YYYYMMDD_HHMMSS.md`다. Timestamp/Environment/Executed Steps/Observed Logs/Failures/Reproducibility/Locator Outcome을 두고 runId·source revision/dirty diff hash·명령·Node/npm/Docker/PG/PGMQ/image/bundle hash·비밀을 제외한 환경값·실시ID·출력파일·duration·API/WS frame·DB 대조를 기록한다. screenshot/Playwright trace/console/network failure는 같은 timestamp artifact 폴더에 둔다. raw bearer/cookie/packet secret은 로그에 남기지 않는다.

행별 VERDICT=PASS/FAIL/BLOCKED/UNVERIFIED, 사전 범위 밖만 SCOPE-EXCLUDED다. mock/local/실제DB/deployed browser를 별도 열로 나누고 health·compile·원본 check_examples 통과를 issus 수용 성공으로 확대하지 않는다. §0의 v1 실행 기록과 v2의 문서/정본 대조를 구별한다. 이 절의 issus 시험은 모두 미실시다. 완료는 fixture37·**I-V1·I-01~15·I-P1·I-S1~2·I-D1·C-01~02**·B-01~03·O-01과 위 필수 단위(U-D2/U-E1/U-C2 포함)가 통과하고 g1/g2 리뷰·문서가 갖춰진 시점이다. I-V1/I-S2·I-07 보완의 근거: DECISION 6310243238. I-01 보완/C-02의 근거: DECISION 6310757267. Monitor 실제 세션 깨우기는 §5.6대로 배포 후 오케스트레이터가 실기 확인하고 별도 증거로 남긴다. 추가 시험도 필수이며 v1의 좁은 smoke 범위로 완료를 축소하지 않는다. commit/push는 이번 설계 담당의 범위 밖이다.

## 11. 구현 단계와 담당 경계

**결정:** 8단위, 계약→기반→기능→CLI/UI→통합 순서다. 단위별 담당을 정하고 공유 root/공개 barrel/공통 migration 편집자는 1명으로 고정한다. 단계별 독립 VERIFY를 요청한다(이번 설계 세션에서 다른 agent를 기동하지 않는다).

**근거:** 공유 파일 동시 편집을 피하면서 구현자가 의존과 완료 조건만으로 착수할 수 있다. **대안:** 기능명만 나누는 자유 병렬은 같은 schema/manifest를 건드리므로 채택하지 않는다.

아래 모든 app/package glob에서 P1 소유 manifest·Docker/env·최상위 export/import 조립 파일은 제외한다. 기능 폴더 안의 하위 index.ts는 해당 기능 담당 소유다. P2의 agent 전체 경로만 P1 scaffold 완료 뒤 명시적으로 인계한다. P7의 domain front도 최상위 front/index.ts는 제외한다. 이 예외를 적용한 경계가 실제 파일 소유권이며 각 담당이 root 파일을 고쳐 합의하는 방식은 쓰지 않는다.

| 순서 / 담당 확정(DECISION 6307832679 Q1) | 소유 파일 경계 | 의존 / 완료 조건 |
| --- | --- | --- |
| P1 `issus-1-base` | root package/lock/turbo/tsconfig/scripts/compose/.npmrc/.dockerignore, 전체 workspace 초기 package.json, 패키지 최상위 `src/{common,server,front}/index.ts`와 app entry의 import 조립, docs/vendoring, apps/issus-db, 각 app Docker/env | 2차 design PASS 뒤. vendor slot, 모듈당1container, local build/runtime·deploy 골격. 전체 workspace manifest 후속 변경도 P1에 요청 |
| P2 `issus-1-agent` | `packages/agent/**`(P1 초기 manifest 인계 뒤 agent manifest 포함) | P1. source byte manifest+patch, auth 주입/immutable cursor/WS authorize/appendOn/prune off/전체read cursor 회수/**반응 source3개 보존(U-E1)**, 독립runtime tests. 원본변경0 |
| P3 `issus-1-domain` | `issus_domain/src/common/**`(최상위 common/index.ts 제외), fixture37+flows9/golden, domain protocol docs, `server/backend/schema/**` baseline migration | P1+design. 전체 action/payload/parser/validation, 32/5 parity, owner/alias/schema·table 이름 고정. 후속 migration은 순번+담당별 파일명, baseline 편집 금지 |
| P4 `issus-1-core` | `issus_domain/server/intake/**`, backend/{event-uow,command-result,repository,authorization}, issus_runtime/server/{config,auth,migrations,health}, apps/issus/http의 repo/issue/comment/validate/alias/session/board/handoff/operations/auth | P2+P3. repo/alias/issue/comment/board/handoff/close, tx/event 일치, 422/409/idempotency, session 인증, I-02/I-07/I-08. 공유 UoW API는 P4가 공개, 타담당은 호출만 |
| P5 `issus-1-deliver` | domain server/{routing,delivery,scheduling}, runtime/{worker-bindings,scheduler-producer,adapters}, apps/issus-worker, apps/issus-scheduler, apps/issus/{reactions,stream,http/inbox,http/subscriptions}(src/server 아래), **`apps/issus/src/server/http/deliveries/{receipts,application}/**`**, **`apps/issus/tests/integration/deliveries/**`** 및 `apps/issus/tests/plans/deliveries-20261021.md`·`apps/issus/tests/reports/deliveries/**` | P2+P3+P4 공개UoW. **POST `/v1/deliveries/receipts`·POST `/v1/deliveries/:id/application`의 라우터/인증검사/공통 제출기 연결과 전용 I-D1은 P5 소유**. route/receipt/pendingLegacy/ackState/retry/escalation/WS+SSE+pull/bootstrap, I-01~05/I-09~11/I-13/I-14. barrel/manifest 변경은 P1에 요청 |
| P6 `issus-1-compact` | domain server/compact, apps/issus/http/compact, domain compact docs/tests | P3+P4 UoW, P5 due 알림계약. MASKS/packet/stale/atomic pointer, I-06/U-C/U-M. comment dispatch의 COMPACT hook은 P4가 1회 통합(P6은 타입/API 제공) |
| P7 `issus-1-client` | apps/cli/**(manifest는 P1에 요청), domain/src/front/**, CLI docs/test | P3 API계약부터 병렬착수, P4~6 실제API로 수용. 전체 호환인자/exit/state, nonTTY 안전, stream 재접속·Windows UTF-8·비밀 비표시 |
| P8 `issus-1-web` | apps/issus/src/front/**, apps/issus/tests/{plans,reports,browser,integration}(**P5 deliveries 전용 경로 제외**), root README/docs 운영/API/시험(design/vendoring 별도소유) | P3 계약으로 UI 병렬, P4~7 합류 뒤 E2E/O. semantic DOM·Playwright deployed 시험, 계획 전건 실행·증거, I-D1은 P5 결과를 통합 보고하고 전용 시험 소스 편집은 P5에 요청. root wiring은 P1 통합 요청 |

구현 별칭은 위 8개로 확정이며 폐기된 impl 형식은 배정 라벨에도 사용하지 않는다. P1은 초기 작업 뒤 사라지는 담당이 아니라 root integration owner로 끝까지 남는다. P2/P3 공개 타입 동결 전에 P4 이후가 같은 파일에 임의로 타입을 추가하지 않는다. 새 action/queue/schema는 issue DECISION→P3/P1에 요청한다. P5 deliveries HTTP는 P4의 공통 인증/제출 UoW API를 호출하며 P4 파일을 함께 편집하지 않는다. 루트 route 등록은 P1 조립 담당이 P5 export를 연결한다. 담당별 자체 시험이 필요하며 P8 통합 시험이 이를 대체하지 않는다.

단계별 report에 소유 path/변경 요지/실시 test/미검증/다음 담당에게 넘기는 export를 적는다. g1=2차 design VERIFY PASS, g2=단계별 VERIFY다. 리뷰 지적은 이 문서를 개정하며 미결을 담당자 판단으로 몰래 채우지 않는다. 설계 담당은 이번 v2와 SUPERSEDES REPORT를 제출하고 2차 VERIFY를 기다린다.

## 12. 비범위·확정 결정

**결정:** GitHub 양방향 미러, 다중 사용자 조직/RBAC, 일반 공개 SaaS, 외부 agent 강제 기동, LLM 자동요약, 프로세스 강제정지, 다지역 분산, 장기 이벤트 자동삭제는 초기 제품 비범위다. **근거:** brief의 로컬1owner 통신과 감사 완성을 우선한다. **대안:** 초기 외부서비스 연동 확대는 인증/동기화/도달 보장을 미검증 상태로 늘리므로 채택하지 않는다.

| 번호 | DECISION 6307832679 확정 사항 | 적용·남은 경계 |
| --- | --- | --- |
| Q1 확정 | 구현 FROM은 `issus-1-base`, `issus-1-agent`, `issus-1-domain`, `issus-1-core`, `issus-1-deliver`, `issus-1-compact`, `issus-1-client`, `issus-1-web` | §11 담당 그대로. `issus-1-impl-<영역>` 폐기(라벨도 금지), 정본 regex·TYPE 13·봉투 검사 변경 없음. 미결 아님 |
| Q2 확정 | hikaMaeng 동일 소유자 사설 ndx_business→issus vendoring 허용 | §1.1 vendoring.md에 출처 repo/HEAD/경로/파일 SHA-256/라이선스 확인 결과 기록. LICENSE 없으면 `없음, 소유자 동일`, 외부 공개 배포 가능 여부 `미확인`. 임의 라이선스 부여 금지. 사설 이관 허용은 미결 아님 |

Verdaccio 후보/의존 최신version/image digest/RemoteTrigger 실제연결/실제DB 성능/본 서비스 전체시험은 구현 단계에서 확인하고 결과를 보고한다. Q1/Q2 결정은 위와 같이 닫혔다. 구현 분기는 이 문서의 결정을 기본값으로 삼고 필요한 변경은 #1에 제안한다.

## 13. 규약 고정물과 출처 기록

source root: `C:/Users/hika0/.claude/skills/issue-board-collab`. 구현 시 `packages/issus_domain/tests/fixtures/issue-board-v2/`에 복사한다. good은 아래 examples 직하32건, bad는5건을 원래 이름으로 **byte-identical** 복사한다. 원본 README는 설명으로 별도 분류하고 flows9는 참고 명세이며 comment fixture에 넣지 않는다. manifest.json에는 source absolute path/relative path/sha256/kind/expected를 저장한다. fixture bytes를 LF 변환하고 같은 hash라고 주장하지 않는다.

manifest 대조용 정규 텍스트는 relative path 오름차순, 각 행 `<source-relative-path>\t<sha256>\n`, UTF-8이다. 37행 SHA-256=`a2387942ff0739cea867846f69b74e34b0dac42f58117d81f2353af38f520404`. good의 `board-body.md`와 `issue-body-*.md`3건만 checkIssueBody, 나머지28건은 checkComment다. 아래 hash는 이번에 읽은 byte의 SHA-256이며 fixture를 issus에 이미 복사했다는 보고가 아니다(설계 외 코드/fixture 작성은 이번 금지).

| source-relative-path | SHA-256 |
| --- | --- |
| examples/ack-accept.md | 6d0b95cc95754c96cc52d45a9053b1c59fd7450f3f2f092c41397823586852e6 |
| examples/ack-objection.md | cccd2d75c622ab4f6e6dc8d82c85237b775538768a12d17f2816ff8f839fbc0b |
| examples/ack-yield.md | 72ebfc33e9d10bf2b7fd789f3fac229d6bd614875905832ab46fbc90aafaf391 |
| examples/alias-register.md | 24311b60fca9c83610999cbc4e6d5d7a9d16e6a5c20a737dd5339f34770edeef |
| examples/alias-rename.md | 0f91dc37d2b81f046c6379449a5bdbe76c533d9cf3049d6aa1764bdc7227bea1 |
| examples/ask-noenv.md | a8e5c648e8a30af70b9325cc1b1e14be3de3dd7403016099ff6652be260e9c9f |
| examples/ask-slot-1.md | f9ea7a25da8f25b3db7466d9b10d5d118d6c1acfeb1f270202fdd3cb860da167 |
| examples/ask-slot-2.md | 54ca84b1380b929b4a553d7a9aa6eb43c4f59a0ec9f401e221fac52deb255dba |
| examples/ask.md | e5e31e4aa08ec36100ba997414d5f8b322a91004c53a05f7da4946760a4c48ff |
| examples/bad/alias-character.md | 4971389f8f9c2b3bd3d0f7e70e794fe5189d37e9093981ec15487d0aa13e768a |
| examples/bad/ask-no-to-two-requests.md | 79d78836c596a31c5741c231804386d84698754e8c3f987f3815dbeb32bb00e7 |
| examples/bad/compact-no-marker.md | 77561a86f2574885a97040df2fb44754c951958088b767544b8c124cf70867d3 |
| examples/bad/noenv-fix-candidate.md | 649412388fcef110406d4d8ebecf34903da8207d9b6681d5cd691fdd7168cda5 |
| examples/bad/plan-due-no-date.md | f82c8e4cd6014e549892ab8ac3cefcf2176a92ff090d6bb2803c84a8aa2b931f |
| examples/board-body.md | fb64a36045c04ffc1428f76210bb8dc0d3de44afbd1df2575f6d3ada58d75559 |
| examples/board-lesson.md | 64049e2c3101a18a90ba61cac0dfaf40478bc428f6315e3e30c8e678804371a5 |
| examples/board-note.md | 4ce9a539c92f0eb82d708a8723d84679e2c31c2afd17739955c6b177eaa1fd79 |
| examples/claim.md | 979a44beb20a56e0e26b5b8c32877d9a6fde5b5e26305c7e0b3a1a2b3e5be34c |
| examples/compact.md | cdd1552541d7806d902ac9638c1c0ddcf87decc9955422cb5ab449034f9357fa |
| examples/decision-criteria.md | 388076815e68dae770e26bbad7e406a3efe239ea3205ef79a4224579d5618ff7 |
| examples/decision-unhold.md | e6ab8a4ae6640bdcfac3188f6071aea13c6b967ab71203fec940aa962581887e |
| examples/decision-user.md | 142ec3dc48827abc8fe17287acbc6e93a940d232b31a1bbb2ceb5e80f41b81ce |
| examples/handoff.md | 7c3acbb1e412754c881fe831f6ca77328198e366d558c5ed5d98a515a2eeb569 |
| examples/hold.md | a9f07c431f1b575721a7767c4257e29c9e88c899cafcaa81effbe18fece93c5c |
| examples/issue-body-cancelled.md | 7011fb9131a44ba7bb76be16d2324899c90d7deb6a0e6b6d34a93a107f410c34 |
| examples/issue-body-closing.md | d16a0b28837f42fa8f536c596f367168cc32395480e2e70a9bd87b467fa87438 |
| examples/issue-body-running.md | 778ca954d4827c3f346ab341fb97c7d876d0865da17a72230ce391d7e94b0883 |
| examples/note-cc.md | 5ba4c5a7c1496009c0766c27d99bd7b0287eb643b7171b6a809fc109adacc6d0 |
| examples/note-session-resume.md | 6bbb6a19e65abb3ce887be8f1f1c1129c5ad3144a495cb4afe938550bc6b0d9e |
| examples/note.md | 65699fb3d00ff095978f5db571a629fcdb6928d199c85744188ebcdab7a0f7cf |
| examples/plan-revision.md | 7cb5970035d4fd48918bd7439a8fdee3a724097f9307d4007806c1156793baf5 |
| examples/plan.md | 71e32fb70e27c49ec0a882c27f0c19e74f08a559e241cde1ac2c83ebbb499ef1 |
| examples/release.md | f3dcf92c3023291f725011977cbc138357a611ada06b49555038258d5c259a49 |
| examples/report-final.md | 1d18c6c1bd483a83e4997b306ef8c47dd6371e5185a1b525a5d09142eae2aa1e |
| examples/report-fix-candidate.md | 02e6247436db2abb6062727bc5752ab22d0cc59d24ecf51e2ff59f754284a5c1 |
| examples/report-progress.md | 4528209c09fe3bb3c710ec76c8460fbce854f0e432b39813f4c4b3902a39bce7 |
| examples/verify.md | 302551c36e4302a2cac7856df8090a83742f8e79f897481446e39fca1e9a8311 |

Python source hash: issue_post.py=`67d01e961496f842f5764161c382a9c0abb291d6e62e99811e1e72e9c95b55fd`; issue_watch.py=`b73600dc3352269285c245a03240097f983b1ff40e3a42e678fae8c7773a9d70`; alias_check.py=`e1de9205f8c142390dba933fb3617864f26c02b52b7cac1f11112e5a65e18283`; compact_prepare.py=`617e8c64305792cb36e08d3ef7502c282cd688b191f951971367a57d1fd246f6`; board_find.py=`563d8ac13b97e8f6f7a4a4540a1ed2b683f445f9ebd153e92b51399f50461070`. 이식 시 source path/hash/function scope를 manifest에 기록하고 이 snapshot에서 golden을 만든다. source가 바뀌면 snapshot 갱신을 별도 DECISION으로 리뷰한다.

## 14. 수용 기준 대조표

| brief 요구 | 충족 설계 위치 | 구현 수용 증거 |
| --- | --- | --- |
| 1 도메인 | §2 repo/issue/comment·STATE·alias registry/session·board·HANDOFF ACK·close, §3 전수 검증, §4 사건 | U-V/U-A, I-02/I-07, 32 good/5 bad, body/state/event 원자성 |
| 2 구독·push | §5 alias/채널·reading 우선순위·ACK/반영·overdue/escalation·WS/SSE·pull·선택 adapter, §5.3 subprotocol 인증·별칭 필터·자족적 JSON, §5.6 Monitor ws/백그라운드 once/Codex pull·래퍼/RemoteTrigger off·미확인, §7 API·§8 once/until. 근거: DECISION 6310757267 | I-01~05/I-09~14/I-D1, C-02, B-02/03, 실제 PG/PGMQ+두 가짜 세션 프레임/DB 증거 및 배포 뒤 오케스트레이터의 Monitor 실제 세션 깨우기 관측 |
| 3 COMPACT | §6 임계·OWNER due·packet MASKS·marker·stale 방어·본문 pointer, §5 globalPending | U-C/U-M, I-06, B-01, since-compact 데이터 누락 0 |
| 4 CLI·스킬 | §8 six commands/호환 인자·exit·cursor·UTF-8·배포 | C-01/CLI compatibility report, Python golden fixture와 실제 API 왕복; GitHub 미러는 §12 비범위 |
| 5 운영 | §1 단일 compose/module container/PGMQ/volume, §9 구조·npm deploy·영속·복구, §7 semantic UI | O-01/I-12, deployed browser B-01~03, README/docs 7종·운영 기록 |
| 6 검증·문서·커밋 | §10 전 시험 ID/계획·보고·증거/미실행 표기, §11 독립 단계 리뷰·통합, §13 fixture 출처 | 37 fixture+실DB 통합+deployed headless+deploy report+문서. **이번 담당은 사용자 금지에 따라 커밋·push하지 않으며**, 전체 구현 후 커밋은 오케스트레이터의 별도 구현/통합 단계 책임 |


