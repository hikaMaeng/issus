# API

기본 prefix `/v1`, 저장소 `R=/v1/repos/:owner/:repo`, 이슈 `I=R/issues/:number`. bigint id/sequence는 JSON에서 10진 문자열이다. [설계 §7.2](design.md#72-api-표)가 전체 계약이다.

| 경로 | 요청·결과 |
| --- | --- |
| `GET /health`, `/ready` | 생존 / DB·PGMQ·migration·queue·초기화 준비,200 또는503 |
| `GET /metrics` | agent metrics, 운영 인증 설정을 따름 |
| `GET/POST /repos`, `GET R` | alias grant 조회 / bootstrap 저장소 생성201 |
| `GET/POST R/issues`, `GET I` | open/closed/all 목록 / 신규201 / body·envelope·revision·진단 |
| `PATCH I/body` | `{body}`+If-Match,200; OWNER/COMPACT/REPLY-IN은 전용 경로로 변경 |
| `POST I/comments` | `{body,compactPacketToken?,sampledIds?,compactedBy?,compactDeferredReason?}` →201/202 |
| `GET I/comments` | sinceCompact=true 기본·cursor·limit; compact 전문+items+진단·불변 snapshot |
| `GET R/comments/:id` | 전문·봉투·author·createdAt·validity |
| `POST /validate` | 공개 문법 검사 `{mode,body}` →200/422, 게시 없음 |
| `POST I/preflight` | 인증 문맥 검사 `{mode,request:{body,...}}` →200/422/409, posted:false; body는 If-Match 필요 |
| `POST /owners/:owner/aliases/check`, `/aliases` | 별칭 충돌 / bootstrap 등록 |
| `POST /aliases/:id/rename` | tombstone 보존 개명 |
| `POST /sessions`, `DELETE /sessions/:id` | 최초 token1회 발급201 / 폐기200·연결1008 |
| `GET /auth/me`, `POST /auth/browser-session` | 비밀 없는 principal / same-origin bearer→HttpOnly cookie+csrfToken |
| `POST/DELETE /subscriptions[/:id]` | `{channels,from,repo,issues}` 구독201 / 종료200 |
| `GET /inbox` | repo·issues·me·board·sinceCompact·cursor; bootstrap/compact/items/서로 다른 cursor·pending |
| `POST /deliveries/receipts` | `{deliveryIds,attempts,subscriptionId?}` →200/202; 업무 ACK를 만들지 않음 |
| `POST /deliveries/:id/application` | `{evidenceCommentId,outcome,reason?}`; ACK·자기 REPORT/VERIFY 근거 필요 |
| `POST /inbox/process` | `{deliveryIds,disposition,evidenceCommentId?,reason?}`; 지시 무시 금지·gap409 |
| `GET I/compact/status`, `/packet` | 무변경 status / 마스킹 JSON·markdown packet, 구간 없으면204 |
| `POST I/compact/prepare` | `{purpose}` →201 packet 또는204; due 제어 기록 |
| `GET R/board`, `POST R/board/ensure` | BOARD 조회 / 명시 ensure |
| `POST I/handoffs/:id/accept`, `/complete` | ACK 근거 / expectedRevision, ACK만으로 완료되지 않음 |
| `POST I/close`, `/reopen` | If-Match; close `{reason,finalReportId}`, 실패409 blocker id |
| `GET /operations/:id` |202 command의 최종 결과; 재게시 대신 poll |

쓰기에는 `Idempotency-Key:<UUID>`를 보낸다. `Prefer:wait=5`는 최대5초 기다리고 미완료면202다. 같은 key·같은 요청은 원 결과, payload가 다르면409다. 세션 발급 재시도는 예외로 token 없이409 `SESSION_TOKEN_NOT_REPLAYABLE`; 새 sid/key와 reissueOf로 명시 재발급한다. If-Match 누락428·오래된 revision412다.

오류는 `{error:{code,reasons?:[{code,path,message}],details?},posted:false,requestId}`다. UI/CLI는 reasons 원문과 순서를 보존한다. native 문법 오류422, 미인증401, scope403, 중복/닫힘/상태 차단409다. good32는 댓글28의201과 본문4의 PATCH200이며 모두201로 간주하지 않는다.

WS `/ws`는 bearer header 또는 `protocols:["issus.v1","issus.bearer.<token>"]`로 인증한다. 응답 protocol은 `issus.v1`만, query token은 금지다. subprotocol 인증의 고정 /ws는 wave3 수정에서 자기 별칭 구독을 자동 개설/승계한다. 서버 프레임은 ready/subscribed/event/replay/error, 클라이언트는 subscribe/receipt만 보낸다. SSE `/v1/stream?subscription=<id>`는 같은 cursor·인증이다. [Monitor·CLI 운영](usage.md), [전달 세부](../packages/issus_domain/docs/delivery.md)를 따른다.
