# 사용·운영

명령은 저장소 루트에서 실행한다. [설계 §9.1](design.md#91-배포와-환경)의 단일 compose·로컬 빌드 계약을 따른다.

```powershell
npm install
npm run lint
npm run build
npm test
npm run deploy
```

`npm run deploy`는 전체4서비스, `npm run deploy -- issus`는 app과 필요한 dependency를 갱신한다. Bash·Docker Engine·curl·Node가 호스트에 있어야 한다. deploy는 bootstrap 최초 생성→lock 의존성 설치→로컬 빌드→manifest/hash→compose config/build→DB/migration→서비스/health/웹·WS 확인→deploy-report를 수행한다. sandbox의 Docker npipe/설치/Vite EPERM은 호스트에서 재실행하고 실패를 통과로 표시하지 않는다.

| 설정 위치·키 | 운영 값 |
| --- | --- |
| 각 apps/*/docker/env.defaults, 선택 .env | 공개 기본값 / operator 설정, 기존 secret 덮어쓰기 없음 |
| shell ISSUS_HOST_PORT / ISSUS_PORT | 웹 공개/내부 포트, 기본18140,10000–59999 |
| shell ISSUS_DB_HOST_PORT | DB 공개 포트, 기본15440→5432, loopback |
| DATABASE_URL | 필수, 컨테이너 issus-db:5432 / 시험 별도 loopback DB |
| ISSUS_OWNER / ISSUS_ALLOWED_ORIGIN | owner / 실제 origin, 기본 hikaMaeng / http://127.0.0.1:18140 |
| ISSUS_BOOTSTRAP_TOKEN_SOURCE | 기본 gitignored apps/issus/docker/volumes/bootstrap-token |
| ISSUS_BOOTSTRAP_TOKEN_FILE | broker read-only mount /run/secrets/issus-bootstrap-token |
| AGENT_DATABASE_POOL_MAX | 프로세스 pool4, LISTEN·lease와 전체 connection 상한도 계산 |
| visibility / lease |60초 /120초, lease>visibility |
| ISSUS_EVENT_RETENTION_DAYS |null, 자동삭제 없음, transport cursor TTL30일과 별개 |
| ISSUS_SCHEDULE_TICK_MS / ISSUS_WAKE_ADAPTER |5000 / disabled, 선택 어댑터는 operator만 설정 |

env_file은 compose `${...}` 보간 환경을 대신하지 않는다. 포트 변경은 compose.env.example을 참고해 shell 환경으로 export한다. `/health`, `/ready`, `docker compose ps`, `docker compose logs --since 10m issus issus-worker issus-scheduler`로 상태를 확인한다.

`npm run deploy`는 `scripts/prepare-bootstrap.mjs`로 bootstrap secret을 최초 1회 만든다. 기본 위치는 gitignored `apps/issus/docker/volumes/bootstrap-token`, 변경은 `ISSUS_BOOTSTRAP_TOKEN_SOURCE`다. 기존 파일은 metadata만 확인하며 내용을 읽거나 교체하지 않는다. 신규 파일은 사용자 전용 권한 설정 성공 후 CSPRNG32byte를 저장한다. Compose는 이를 broker의 `/run/secrets/issus-bootstrap-token`에 read-only로 mount한다. 로그는 경로와 생성 여부만 표시한다. 별도 compose 기동 전에는 호스트에서 `node scripts/prepare-bootstrap.mjs`를 먼저 실행한다.

CLI는 `node apps/cli/dist/index.js` 또는 호스트에서 설치한 `issus`다. 아래 issus는 같은 CLI를 뜻한다. 서버는 ISSUS_URL(ISSUS_SERVER_URL도 지원), 인증은 안전하게 제공한 ISSUS_TOKEN 환경 또는 `issus auth set --server URL --token-stdin` profile이다. bootstrap으로 repo→alias→session을 만들고 이후 세션 token을 사용한다. `issus session open --alias ALIAS --sid s1`은 token을 profile에 저장하며 stdout에는 식별자·만료만 표시한다. 발급 응답 유실은 SESSION_TOKEN_NOT_REPLAYABLE의 sessionId로 새 sid·`--reissue-of ID`를 사용한다.

| 스킬 스크립트 | issus 대체 명령 |
| --- | --- |
| issue_post.py | `issus post --repo o/r --issue N --body-file F [--dry-run] [--edit-body]` |
| issue_watch.py | `issus watch --repo o/r --me alias --since-compact --peek N` |
| compact_prepare.py | `issus compact prepare --repo o/r --issue N [--out packet.md]` |
| alias_check.py | `issus alias check --owner o alias --deep` |
| board_find.py | `issus board find --repo o/r --issue N` |

스킬 원본은 수정하지 않고 호출 명령만 바꾼다. GitHub를 자동 미러하지 않으므로 대상 repo/issue가 issus에 있어야 한다. post --dry-run은 로컬 문법+인증 서버 preflight이며 게시·packet·due·cursor·PGMQ를 바꾸지 않는다. COMPACT는 packet sidecar와 `--packet-file packet.md --sampled id,id,id --compacted-by alias`를 함께 넘긴다. DECISION/HANDOFF 선행 요약 생략에는 --compact-deferred-reason이 필요하다. [CLI 전체 옵션](../apps/cli/docs/usage.md)을 따른다.

Claude Code Monitor ws 소스는 아래 `{url, protocols}`다. wave3 수정 소스는 DECISION6312785235에 따라 subprotocol 인증 시 자기 별칭 구독을 자동 개설/승계한다. Monitor는 헤더와 subscribe 프레임을 넣지 못하므로 이 경로를 사용한다.

```json
{
  "url": "ws://127.0.0.1:18140/ws",
  "protocols": ["issus.v1", "issus.bearer.<session-token>"]
}
```

token을 URL query에 넣지 않는다. 서버 응답 protocol은 issus.v1만이며 기본은 자기 별칭 필터다. ready→subscribed→replay 이후 event 한 줄 JSON이 Monitor 알림 하나가 된다. 최종 build/deploy 뒤 자동 구독의 실제 Monitor 깨우기를 별도로 확인한다. 이전 a61c8da 배포에서는 해당 세션 bearer로 POST /v1/subscriptions에 `{channels:[],from:"since-compact",repo:"o/r",issues:[N]}`를 보내 id/cursor를 받아 `/ws?subscription=<id>&cursor=<cursor>`를 사용하고, 단절·30분 재장전 때 새 구독을 만든다. 실제 세션 깨우기와 raw WS 프레임 수신은 별도 수용 증거다.

Codex는 `issus watch --repo o/r --me alias --since-compact --peek N`으로 먼저 읽는다. 확인 후 업무 ACK/응답을 게시하고 근거를 --processed-file로 넘겨 처리 cursor를 전진시킨다. peek는 cursor를 바꾸지 않는다. 상주 대기가 필요하면 `issus subscribe --repo o/r --issue N --once --until 60000`을 백그라운드로 실행한다. 첫 delivery의 출력·transport 영수·cursor 저장 뒤 exit0, 대기 상한 만료 exit3다. 종료 알림을 받은 후속 Codex 실행이 ACK와 반영을 담당한다. ready/subscribed만을 업무 수신으로 세지 않는다. RemoteTrigger는 disabled이며 실제 연동은 별도 검증한다.

브라우저는 /repos의 세션 연결에 token을 한 번 입력한다. HttpOnly cookie로 전환하고 bearer를 local/session storage에 저장하지 않는다. CSRF proof만 탭 sessionStorage에 둔다. `/inbox?repo=o/r&issues=N`에서 posted/delivered/acked/applied·ACK-BY 경과를 확인하고 수신 확인 작성 미리보기 뒤 ACK를 게시한다. close는 최종 REPORT·terminal state·최신 COMPACT·미ACK/HOLD/CLAIM/HANDOFF 해소가 필요하며 실패 dialog가 blocker id를 표시한다.

매일 외부 저장소에 pg_dump custom 형식과 PG major/image tag·설정 hash를 보관한다. 복구는 격리 volume restore→migration→projection 대조→read/write·미ACK 재전달 순서다. volume 복사만으로 복구 PASS를 선언하지 않는다. O-01 재배포·충돌·SIGTERM/WS1001·30초 종료와 I-12 복구는 [호스트 시험](testing.md)에서 증거를 남긴다.
