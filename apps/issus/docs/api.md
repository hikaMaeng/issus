# api

정본: design.md §7. `R=/v1/repos/:owner/:repo`, `I=R/issues/:number`. JSON UTF-8/64KiB. 쓰기는 UUID Idempotency-Key 필수이며 syntax validate·alias check·preflight는 무변경 검사다. bearer 또는 브라우저 session cookie를 사용한다.

| 메서드·경로 | 요청 | 성공·주요 오류 |
| --- | --- | --- |
| POST /v1/repos | owner,slug,projectCode,autoBoard=true,boardOwner?; bootstrap |201 repo+board 또는202;409 충돌 |
| GET /v1/repos / R | cursor?,limit1–500 |items/nextCursor 또는 detail |
| POST R/issues |title,body |201 number/revision 또는202;422 body |
| GET R/issues |state=open/closed/all,owner?,alias?,q?,sort=updated/created/number,order=asc/desc,cursor?,limit1–500 |items/nextCursor, 아래 Q2 계약; 지원 외 query400+reasons |
| GET I |— |issue/body/envelope/revision/stats/pendingLegacy/ackState/activeHolds/claims; ETag |
| PATCH I/body |body, If-Match revision |200 revision 또는202;428 누락/412 stale/422 |
| POST I/comments |아래 metadata 표 |201 commentId/eventId/revision 또는202;422/409 |
| GET I/comments |sinceCompact=true,cursor UUID?,limit? |compact/items/nextCursor/snapshot/pendingLegacy/windowPendingAck/globalPendingAck/ackState/stats |
| GET R/comments/:id |— |immutable 원문/봉투/metadata/author/createdAt/validity;404 foreign |
| POST /v1/validate |mode=comment/issue-body,body |200 valid/chars/envelope;422 정본 reasons, DB 사용 없음 |
| POST I/preflight |mode,request; body 모드는 If-Match |200 valid/posted:false/context/compact; 실제 게시와 같은 거부 |
| POST /v1/owners/:owner/aliases/check |name,deep? |available/collisions, owner 전체·tombstone 포함 |
| GET /v1/owners/:owner/aliases |q?,cursor?,limit1–500 |items/nextCursor, 같은 owner principal; 타owner403 |
| GET /v1/owners/:owner/aliases/:name |query 없음 |alias/recentIssues/openClaimCount; 타owner403·없음404 |
| POST /v1/owners/:owner/aliases |name,role,model,scope,repos,announcementIssue?,announcementBody; bootstrap |201 alias+ALIAS comment 동기 완료; 동일 actor/key/payload는 원201 멱등 재생;409 충돌 |
| POST /v1/aliases/:id/rename |newName,announcementIssue?,announcementBody |200 alias/oldName 동기 완료; 동일 actor/key/payload는 원200 멱등 재생;409 충돌/개명 |
| POST /v1/sessions |alias,sid,resumeFrom?,reissueOf?; bootstrap |최초201 token/sessionId/expiresAt/alias/sid; 재시도409 예외 |
| DELETE /v1/sessions/:id |bootstrap/self |200 revoked |
| GET /v1/auth/me |— |principal+expiresAt, token 없음 |
| POST /v1/auth/browser-session |session bearer+동일 Origin |200 csrfToken, HttpOnly cookie |
| GET R/board |issue?,userBoard? |number/state/via/evidence;404 없음/409 충돌·닫힘 |
| POST R/board/ensure |boardOwner,body?; bootstrap |신규201/기존200 또는202;닫힘409 |
| POST I/handoffs/:commentId/accept |ackCommentId |200 accepted/revision 또는202;422 bad ACK |
| POST I/handoffs/:commentId/complete |expectedRevision |200 completed/body/revision 또는202;409 pending |
| POST I/close |reason,finalReportId,If-Match |200 closed 또는202;409 CLOSE_BLOCKED/BOARD_UNAVAILABLE |
| POST I/reopen |reason,state,If-Match |200 reopened 또는202 |
| GET /v1/operations/:id |본인 actor만 |200 status/posted/httpStatus/response/error;404 타인 |
| GET /health / /ready |— |200 live, 준비 성공200/실패503 |

announcementIssue는 공통 protocol의 `{repoId,issueNumber}`다. 외부 요청은 actor/repoId/issueNumber/provenance를 지정할 수 없으며 HTTP 경로·검증된 principal에서 생성한다.

| 댓글 요청 키 | 허용 조건·저장 |
| --- | --- |
| body |모든 댓글 string, 원문 그대로 |
| compactPacketToken |COMPACT만 필수; 해석한 packet 증거만 저장, 원 token은 fact/response에 없음 |
| sampledIds |COMPACT만 필수, tail 원 id 중 최소3(3건 미만 전부), 중복 금지 |
| compactedBy |COMPACT만 필수, 등록 별칭·정확 footer 일치 |
| compactDeferredReason |DECISION/HANDOFF 선행 요약 생략 시 필수, 공백 아닌1–500codepoint |

metadata wrapper·unknown key는422다. COMPACT는 OWNER만, packet의 owner/issue/prev/through/revision/TTL과 원문 마커를 재검사한다. stale409/만료410이면 게시·fact 없음. 강한 마커를 바꾸거나 packet을 재생성해 우회하지 않는다.

일반 동일 actor/key+지문은 원 응답을 반환하고 다른 payload는409 IDEMPOTENCY_CONFLICT다. 다른 key라도 같은 issue/author/body 전체 이력 중복은409 DUPLICATE_COMMENT다. POST sessions는 같은 key에서 token 없는409 SESSION_TOKEN_NOT_REPLAYABLE을 반환한다. 복구는 새 key/미사용 sid/reissueOf로 명시 재발급한다. DB/operation/event/log에 token을 보관하지 않는다.

202는 `{operationId,status:"queued",statusUrl,posted:null}`이며 게시 확정이 아니다. `Prefer:wait=5`면 최대5초 같은 결과를 기다린다. 오류는 `{error:{code,message?,reasons?,details?},posted:false,requestId}`이며 reasons.message와 순서는 정본과 같다.400 JSON/형식,401 인증,403 권한,404 없음,409 상태,410 만료,412 revision,413 상한,422 규약,428 If-Match,503 DB/queue다.

preflight는 Idempotency-Key·operation 없이 즉시200 또는 실제 validator 오류를 반환한다. `context={repoId,issueNumber,revision,checkedAt}`, `compact={due,reasons,count,chars,previousCompactId}`다. 클라이언트 시각을 받지 않으며 read-only snapshot에서 성공·실패 모두 DB/이벤트/큐 쓰기0이다.

## Q1·Q2 읽기 조회 (DECISION 6314143095)

세 경로는 기존 bearer/cookie 세션 인증을 재사용한다. 성공·거부 모두 read-only transaction이며 fact·큐·command_result·history_snapshot 쓰기0이다. 인덱스는 `0004-core-read-indexes.sql` 순번 migration으로만 추가한다. GET은 Idempotency-Key가 필요 없다.

| UI §8 참조 | 응답 shape |
| --- | --- |
| Q1 목록 | `{items:AliasRegistryItem[],nextCursor:string\|null}` |
| AliasRegistryItem | `{id,name,role,model,scope,sid:string\|null,repos:string[],registeredAt:ISO8601,renamedFrom:string[],status:"active"\|"renamed",renamedTo:string\|null}` |
| Q1 상세 | `{alias:AliasRegistryItem,recentIssues:RecentIssue[],openClaimCount:number}` |
| RecentIssue | `{repoId,owner,repo,number,title,state,isOpen,lastActivityAt:ISO8601,lastCommentId:string}` |
| Q2 목록 | `{items:IssueSummary[],nextCursor:string\|null}` |
| IssueSummary | `{number,title,state,isOpen,ownerAliasId,ownerAlias,compact:string\|null,isBoard,revision,updatedAt:ISO8601}` |

Q1은 같은 owner의 bootstrap/session principal에 owner 전체 레지스트리·활동·CLAIM 조회를 허용한다(본인 alias나 repo membership으로 목록을 축소하지 않는다). path owner 불일치는403, 같은 owner에서 없는 name은404다. 토큰·token hash·세션 id는 응답하지 않는다. `repos`는 repo UUID 목록이다. `sid`는 폐기되지 않고 만료 전인 현재 writer 세션, 없으면 null이다. system service의 srv도 같은 기준이다. `renamedFrom`은 현재 stable alias id를 가리키는 이전 이름 목록이다. 개명 tombstone도 목록·상세에 포함하고 `status/renamedTo`로 구분한다. tombstone의 repos/sid/CLAIM은 해당 tombstone row 기준이다.

Q1 목록은 이름의 소문자값을 C collation 오름차순으로 정렬한다. q는 name·role·model·scope에 대한 대소문자 무시 **리터럴 부분문자열** 검색이다. 빈 q는 전체, 최대200자다. 상세 recentIssues는 유효 v2 댓글의 FROM(`/sid` 제외)·TO·CC에 참여한 최근20개 이슈, 마지막 참여 댓글 시각·id 내림차순이다. 현재 별칭과 renamedFrom을 함께 조회하며 OWNER만 맡고 댓글 참여가 없는 이슈는 포함하지 않는다. `openClaimCount`는 owner 전체에서 그 stable alias id의 미RELEASE CLAIM 수이며 이슈 닫힘·DUE 경과만으로 차감하지 않는다.

Q2 필터는 AND 결합한다. `owner`는 현재 이슈 OWNER 별칭, `alias`는 이슈 전체 유효 v2 댓글의 원 FROM(`/sid` 제외)·TO·CC 정확 일치다. 모두 대소문자를 무시한다. 부분 이름·본문 mention·OWNER만의 관계·`TO:ALL` 방송은 참여 별칭으로 계산하지 않는다. 과거 댓글 이름을 개명 후 소급 변경하지 않으므로 alias 필터에 이전 이름을 지정하면 원 참여가 조회된다. 미등록/불일치 별칭은 빈 목록이다. q는 제목 리터럴 부분문자열 검색 또는 양의 정수/`#정수`의 정확한 이슈 번호 검색이며 최대200자다. `%`·`_`는 와일드카드가 아니다. 작업 STATE용 `workState`는 지원하지 않으며400이다.

Q2 기본값은 `state=open&sort=number&order=asc`로 기존 동작을 유지한다. state는 이슈 열림/닫힘 축이고 응답 state는 작업 STATE다. `sort=updated`는 issue 투영의 updated_at과 번호를 같은 order로 정렬하며 댓글 시각으로 대체하지 않는다. `sort=created`는 repo 행 잠금 하의 단조 이슈 번호 할당 순서로 생성 순서를 표현한다(number와 동일). updatedAt은 DB microsecond 정밀도를 보존한다.

공통 limit 기본100·범위1–500. nextCursor를 그대로 넘기며 null이면 현재 조건의 마지막 페이지다. cursor는 저장하지 않는 keyset이며 변경 중 목록을 고정 snapshot이라고 보장하지 않는다. Q1/확장 Q2의 opaque cursor는 principal·조회 조건에 묶인다(limit 변경 허용). 기존 번호 오름차순 조회는 numeric cursor를 유지하며 number/created 정렬은 numeric 위치도 허용한다. cursor=0은 시작이다. 지원 외 키·중복/구조화 값·잘못된 enum/limit/cursor는400 `{error:{code:"INVALID_QUERY"|"UNKNOWN_QUERY",reasons:[{code,path:"query.<key>",message}]},posted:false,requestId}`다. 기존 session 인증이 차단하는 query token은 기존 QUERY_TOKEN_FORBIDDEN을 유지한다.

P5 inbox 병합 builder는 `createInboxHistoryReader(inbox)`를 historyReader에 주입한다. HTTP 조립은 `createDeliveryHttpRouter`, SSE는 `createSseRouter`, WS는 `createStreamCallbacks`이며 production entry 연결은 P1 소유다. /metrics operator 설정·운영 조립은 P1/P5 경계이며 미설정 시404다.

## Inbox·subscriptions·deliveries·stream (P5)

| 메서드·경로 | 요청 | 응답·거부 |
| --- | --- | --- |
| GET /v1/inbox | repo=o/r,issues=1,2,반복 board/me/mine,sinceCompact=true,cursor?,limit1–500 | bootstrap/compact/items/nextCursor/refreshCursor/processedCursor/pendingLegacy/windowPendingAck/globalPendingAck/ackState/activeHolds/claims/handoffs/footers |
| POST /v1/inbox/process | deliveryIds,disposition=acked/replied/ignored,evidenceCommentId? 또는 reason | 200 처리 연속 prefix/processedCursor/lastSeenCommentId 또는202. 지시 ACK 미확인409, 근거불일치422 |
| POST /v1/subscriptions | channels,from=since-compact/start/now,repo,issues; SSE는 ?transport=sse | 201 subscriptionId/channels/cursor/bootstrap/compact/items/pendingLegacy/ackState. 기본 자기 alias+session, 감독은 supervisor 포함. 타scope403 |
| DELETE /v1/subscriptions/:id | 본인 session, Idempotency-Key | 중복도200 closed |
| POST /v1/deliveries/receipts | deliveryIds≤100,동일 길이 attempts,subscriptionId? | 200 receiptIds 또는202. 미인증401, 타alias403, 미래attempt422 |
| POST /v1/deliveries/:id/application | evidenceCommentId,outcome=applied/not-applied,reason? | 직접TO·ACK·본인REPORT/VERIFY RE 근거.200 또는202, ACK_REQUIRED409, 무관근거422 |
| WS /ws | bearer header/동일 Origin cookie 또는 issus.v1+issus.bearer.&lt;token&gt; subprotocol. subscribe/receipt만 | ready/subscribed/event/replay/error, immutable cursor. 외부 event mutation 금지1008 |
| GET /v1/stream | subscription,cursor 또는 Last-Event-ID | event:frame, id:cursor, data:ChannelServerFrame JSON.15초 heartbeat, no-store. receipt는 HTTP |

pull 첫 응답은 가입 전 canonical COMPACT+이후 history와 alias inbox를 viewKey로 합친다. 과거 ALL delivery를 소급 생성하지 않는다. compact에 표시한 원문은 items에 중복되지 않는다. bootstrap에는 mode/snapshotId/meAliases/complete/issue별 compactId·throughCommentId·eventHighWater/inboxThroughOrdinal/inboxThroughEventSequence가 있다.

nextCursor는 frozen page, refreshCursor는 전체 페이지 완료 뒤 H/A/E 갱신, processedCursor는 확인 근거가 있는 연속 ordinal prefix다. TTL30일, 다른 principal/alias/sid/정렬scope는409 CURSOR_SCOPE_MISMATCH, 만료410 CURSOR_EXPIRED. 기존 attempt/state가 바뀌면 commentId/ordinal이 같아도 E로 회수한다. 페이지 items.delivery는 id/ordinal/state/attempt/aliasEventSequence이며 최신 sequence로 upsert한다.

pull fetch·stream receipt는 delivered 증거다. TYPE:ACK RE만 실제 수신 확인이며 실제TO 직접 작성자만 acked가 된다. 제3자/NOTE/CLAIM ACK 게시를 거부하지 않는다. REPORT RE는 pendingLegacy를 해소해도 ACK 상태는 waiting일 수 있다. GET·구독·peek는 processed를 생성하지 않는다.

WS/SSE는 동일 agent hub/replay/mailbox와 채널 권한을 쓴다. 채널32개/각128자, mailbox256/1MiB, 재생batch256. incomplete replay는 마지막 수신 cursor로 재구독한다. old cursor는 송신 뒤에도 불변이다. 실제 외부 wake adapter 연결과 production 조립은 별도 검증한다.

Monitor 접속은 먼저 POST subscriptions로 scope와 cursor를 발급하고 `/ws?subscription=<id>&cursor=<uuid>`를 연다. protocols는 `["issus.v1","issus.bearer.<session-token>"]`이며 응답 protocol은 `issus.v1`만 선택한다(DECISION6310757267). URL query에는 인증 토큰을 넣지 않는다. 이 경로는 앱이 자기 alias 채널 하나로 초기 구독을 계산하므로 Monitor가 subscribe 메시지를 보낼 필요가 없다. 일반 WS의 명시 subscribe도 유지한다. 실제 Claude Code Monitor 세션 깨우기는 배포 뒤 오케스트레이터 실기 검증 경계다.

구독 metadata/items/compact/pending/ackState는 POST 응답에서 공통 builder로 먼저 받는다. WS/SSE bootstrap의 권한 확인된 canonical event는 기존 type:event를 쓰고 현재 transport 위치의 새 cursor만 발급하며 위치를 전진시키지 않는다. OTHER는 HTTP bootstrap의 접힌 봉투로 유지하고 원문 전체를 bootstrap event로 우회 전송하지 않는다. 로컬 revoke는 onSessionRevoked→watchRevocation, 다른 broker는15초 재검증이다.

## COMPACT (P6)

| 경로 | 요청 / 응답 |
| --- | --- |
| GET I/compact/status | repo 인증. previousCompactId/count/chars/due/reasons/owner; 읽기 전용 |
| POST I/compact/prepare | OWNER/감독/bootstrap, Idempotency-Key, `{purpose:"routine"\|"before-decision"\|"before-handoff"\|"before-close"}`; due+packet201, empty204 |
| GET I/compact/packet | OWNER/감독/bootstrap, format=json(기본)\|markdown; packet200, 구간/제어변경 없음204 |
| POST I/comments | 기존 공통 제출기. COMPACT body/compactPacketToken/sampledIds/compactedBy;201 또는202 |

packet JSON은 markdown/count/chars/maskedCount/bodyLine1/previousCompact/comments/suggestedEnvelope/throughId/previousCompactId/snapshotRevision/packetHash/packetToken/pendingAppendix/controlFactsSinceCompact다. `--out`에는 markdown만 UTF-8 LF로 쓰며 token·표본은 전용 sidecar로 보관한다. 기본 파일명은 compact_packet_<owner>_<repo>_<issue>_<through>.md다.

markdown 응답은 X-Compact-Packet-Token/Hash/Through-Id/Snapshot-Revision 헤더로 증거를 준다. 모든 compact 응답은 Cache-Control:no-store다. prepare의 같은 key/payload는 원 snapshot 응답을 재생하며 새 상태를 요약하려면 새 key로 준비한다. snapshot 뒤 새 댓글/revision은 게시 시409 COMPACT_STALE, TTL24h 경과410 COMPACT_PACKET_EXPIRED다.

production GET I/comments는 `createInboxHistoryReader(inbox)`로 canonical+inbox를 병합하며 `compact` 원문과 `compactStatus` 통계를 분리한다. 기본 sinceCompact=true이고 기존 cursor의 경계는 이후 새 COMPACT와 무관하게 유지한다. P6 단독 하네스는 `readCompactHistory`를 쓴다. close 요청 before-close는 P4 core/s3의 별도 제어 tx에 기록해 close 실패에도 보존한다(DECISION 6310243238).

COMPACT 줄2는 `## ===== COMPACT #<실제이슈> through <SEEN> =====`, TO:ALL·전체≤2000codepoint·footer compacted-by:<compactedBy>. tail≥3이면 서로 다른 원 id≥3, 1–2면 전부, control-only0이면 []다. 이전 COMPACT가 있으면 RE에 포함한다. 요청 metadata wrapper/unknown key는422. raw token은 발급 응답/비공개 sidecar 외 저장/이벤트/로그에 남기지 않는다. 제어/생략사유 감사와 구간 밖 의무 부록은 [domain 계약](../../../packages/issus_domain/docs/compact.md)에 따른다.

P9 U3 화면 매핑: inbox는 위 GET·HTTP receipts·process·application·직접 ACK comment 경로를 각각 사용한다. COMPACT 도우미는 prepare packet을 메모리에 묶고 마스킹 markdown만 다운로드한다. 게시 top-level은 body/compactPacketToken/sampledIds/compactedBy이며 footer의 괄호 접미사는 design v2.3대로 허용한다. source/배포 수용과 [전체 UI 계획](../tests/plans/p9-ui-20261021.md)은 별도다.
