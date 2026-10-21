# Test Plan: deliveries

## Created

2026-10-21. 담당 issus-1-deliver/s1, design v2.1 §4–5·§7·§10·§11 P5.

## Goal

P5 push/pull이 같은 영속 alias inbox를 소비하며 정본 pendingLegacy와 실제 ACK 효력이 섞이지 않음을 실DB/PGMQ·HTTP·WS/SSE로 검증한다. 신규 별칭 bootstrap과 새 댓글 없는 기존 delivery refresh까지 필수다.

## Environment

Windows native Node/PowerShell. ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus. 암호 없음. 각 하네스가 임의 접미 issus_p5_*/issus_p5_b_* schema와 p5_*_ pgmq queue를 만들고 종료 시 자기 namespace만 정리한다. production/public 데이터·컨테이너·볼륨은 변경하지 않는다.

## Preconditions

P4 UoW·intake/auth/HTTP와 P2 agent transport가 설치돼 있어야 한다. schema0001–0003과 agent schema를 전용 공간에 적용한다. fake session A/B와 별칭은 실제 HTTP로 발급한다. 시각은 주입 Clock, source는 실DB canonical fact다. 외부 adapter는 disabled. P6 packet은 필요한 경우 명시 fixture로 생성하며 packet API 수용으로 주장하지 않는다.

기본 seedSessions는 public repo/alias/session API를 모두 거친다. 공통 alias model producer/strict decoder 배포가 불일치할 때도 P5 경로를 독립 검증할 수 있도록 `ISSUS_P5_CONTEXT_FIXTURE=1`을 명시하면 P4 insertAlias/reserveSystem+SQL로 repo/alias 문맥만 준비한다. issue/comment/session/인증·UoW·실DB/PGMQ·WS/SSE는 실제 경로다. 이 모드 결과는 문맥 fixture 검증으로 별도 표기하며 public 등록 API 또는 전체 제품 수용 PASS로 승격하지 않는다. 해당 공통 오류의 기본 모드 실패도 함께 보고한다.

## Steps

| ID | 순서·기대 결과 |
| --- | --- |
| I-01/02 | A/B 구독, native 인증·ready/subscribed, A ASK→B ME delivery, 같은key재시도1건·다른key본문중복409, B pull/stream receipt는 delivered |
| I-03/I-D1 | 미인증401·타alias403, 중복receipt1건, ACK전apply409·무관근거422. 직접ACK→REPORT/apply→applied, 늦은receipt 후퇴0. ACK가route보다 먼저여도 ack-evidence 후 acked |
| I-04/15 | HOLD ACK-BY경과 attempt1,30초뒤attempt2, OWNER/감독경보1건. 댓글수·H/A 불변, E증가, B refresh에서 attempt2. 같은attempt의 receipt state변경도 E로회수 |
| I-05 | ACK만으로 HOLD active 유지, 실행CLAIM409, DECISION SUPERSEDES로만해제 |
| I-09 | restart/rebuild 중복projection·delivery0, source위조거부. append/send 실패시행·fact·queue롤백. reaction cursor없음·48h전nativefact·두broker DB advisory lease·승계에서누락0 |
| I-10 | WS/SSE 실제frame, 재생300건→256+44, high-water직후barrier commit, immutable token, 타scope403/1008·ingress금지, SSE HTTP receipt·disconnect |
| I-10/13 lifecycle | 신규C WS/SSE에서 기존 COMPACT+ALL canonical event를 받고 transport position 전진0·소급delivery0. 초기 high-water 조회 실패는503·closed fact1건. SSE runtime.stop은 연결종료·closed fact를 기다리고 신규 stream503 |
| I-11 | 작은commentId 늦은route를 새ordinal로회수. GET/peek processed생성0, 높은ordinal처리로낮은gap통과0. 작은page도 H/A/E고정, 다음refresh에서새댓글회수 |
| I-13 | 기존COMPACT+ALL뒤신규C등록, subscribe없는첫pull에이전compact+ALL·bootstrap. 과거delivery소급0·중복viewKey0 |
| I-14 | board NOTE/CLAIM/제3자ACK모두댓글허용·TO효력0. B REPORT RE로legacy0/ackStatewaiting, retry0·close강화gate유지. mention은ME우선·ACK의무없음 |
| scheduling | producer경합·같은slot중복0, 재시도3회상한·15분digest·전구간RE취소·mention-only정보성digest |
| Monitor 추가결정 | issus.v1+issus.bearer credential 제안, public protocol만 응답, subscribe client frame0·자기alias1개 자동구독·ASK 알림. local revoke1008·3초 이내, token event노출0. 외부 Claude 실제기동은 후속 운영 검증 |

각 시험은 tests/integration/deliveries/* 및 각 소유 패키지의 src tests에 있다. 패키지/앱별 npm test·lint를 실행한다. sandbox의 test-worker/tsx spawn EPERM이면 명령/실패 로그를 보존하고 tsc emit+node --test --test-isolation=none을 실행하며 원시험을 PASS로 쓰지 않는다. esbuild 서버 bundle은 보조 검증이다.

## Expected Results

각 case의 assertion과 전체0fail/skip. 핵심 시나리오의 comment/delivery/receipt/attempt/escalation·H/A/E 수치를 보고서에 원 로그 그대로 남긴다. compile·mock결과를 production배포/외부hook보장으로 확대하지 않는다.

## Logs To Capture

.cache/p5/{typecheck,integration,npm-*,bundle-*,cleanup,barrier}.log 및 tests/reports/deliveries/<stamp>.md. report에 명령·exit/pass/fail/skip·namespace잔류를 적는다.

## Locator Contract

UI 없음. HTTP는정확경로, WS/SSE는type/action/eventId/deliveryId/source3/cursor로판정한다. P8 deployed browser는후속소유다.
