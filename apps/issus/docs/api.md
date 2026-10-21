# api

정본: design.md §7. `R=/v1/repos/:owner/:repo`, `I=R/issues/:number`. JSON UTF-8/64KiB. 쓰기는 UUID Idempotency-Key 필수이며 syntax validate·alias check·preflight는 무변경 검사다. bearer 또는 브라우저 session cookie를 사용한다.

| 메서드·경로 | 요청 | 성공·주요 오류 |
| --- | --- | --- |
| POST /v1/repos | owner,slug,projectCode,autoBoard=true,boardOwner?; bootstrap |201 repo+board 또는202;409 충돌 |
| GET /v1/repos / R | cursor?,limit1–500 |items/nextCursor 또는 detail |
| POST R/issues |title,body |201 number/revision 또는202;422 body |
| GET R/issues |state=open/closed/all,cursor?,limit? |요약 목록 |
| GET I |— |issue/body/envelope/revision/stats/pendingLegacy/ackState/activeHolds/claims; ETag |
| PATCH I/body |body, If-Match revision |200 revision 또는202;428 누락/412 stale/422 |
| POST I/comments |아래 metadata 표 |201 commentId/eventId/revision 또는202;422/409 |
| GET I/comments |sinceCompact=true,cursor UUID?,limit? |compact/items/nextCursor/snapshot/pendingLegacy/windowPendingAck/globalPendingAck/ackState/stats |
| GET R/comments/:id |— |immutable 원문/봉투/metadata/author/createdAt/validity;404 foreign |
| POST /v1/validate |mode=comment/issue-body,body |200 valid/chars/envelope;422 정본 reasons, DB 사용 없음 |
| POST I/preflight |mode,request; body 모드는 If-Match |200 valid/posted:false/context/compact; 실제 게시와 같은 거부 |
| POST /v1/owners/:owner/aliases/check |name,deep? |available/collisions, owner 전체·tombstone 포함 |
| POST /v1/owners/:owner/aliases |name,role,model,scope,repos,announcementIssue?,announcementBody; bootstrap |201 alias+ALIAS comment 또는202;409 충돌 |
| POST /v1/aliases/:id/rename |newName,announcementIssue?,announcementBody |200 alias/oldName 또는202;409 충돌/개명 |
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

P5 소유 후속 경로: POST/DELETE /v1/subscriptions, WS /ws, GET /v1/stream, GET /v1/inbox, POST /v1/deliveries/receipts, POST /v1/deliveries/:id/application, POST /v1/inbox/process. P6 소유: GET I/compact/status, POST I/compact/prepare, GET I/compact/packet. 구체 inbox 병합 builder는 historyReader, COMPACT publication projection은 publication에 주입한다. /metrics operator 설정·운영 조립은 P1/P5 경계이며 미설정 시404다.

## COMPACT (P6)

| 경로 | 요청 / 응답 |
| --- | --- |
| GET I/compact/status | repo 인증. previousCompactId/count/chars/due/reasons/owner; 읽기 전용 |
| POST I/compact/prepare | OWNER/감독/bootstrap, Idempotency-Key, `{purpose:"routine"\|"before-decision"\|"before-handoff"\|"before-close"}`; due+packet201, empty204 |
| GET I/compact/packet | OWNER/감독/bootstrap, format=json(기본)\|markdown; packet200, 구간/제어변경 없음204 |
| POST I/comments | 기존 공통 제출기. COMPACT body/compactPacketToken/sampledIds/compactedBy;201 또는202 |

packet JSON은 markdown/count/chars/maskedCount/bodyLine1/previousCompact/comments/suggestedEnvelope/throughId/previousCompactId/snapshotRevision/packetHash/packetToken/pendingAppendix/controlFactsSinceCompact다. `--out`에는 markdown만 UTF-8 LF로 쓰며 token·표본은 전용 sidecar로 보관한다. 기본 파일명은 compact_packet_<owner>_<repo>_<issue>_<through>.md다.

markdown 응답은 X-Compact-Packet-Token/Hash/Through-Id/Snapshot-Revision 헤더로 증거를 준다. 모든 compact 응답은 Cache-Control:no-store다. prepare의 같은 key/payload는 원 snapshot 응답을 재생하며 새 상태를 요약하려면 새 key로 준비한다. snapshot 뒤 새 댓글/revision은 게시 시409 COMPACT_STALE, TTL24h 경과410 COMPACT_PACKET_EXPIRED다.

COMPACT 줄2는 `## ===== COMPACT #<실제이슈> through <SEEN> =====`, TO:ALL·전체≤2000codepoint·footer compacted-by:<compactedBy>. tail≥3이면 서로 다른 원 id≥3, 1–2면 전부, control-only0이면 []다. 이전 COMPACT가 있으면 RE에 포함한다. 요청 metadata wrapper/unknown key는422. raw token은 발급 응답/비공개 sidecar 외 저장/이벤트/로그에 남기지 않는다. 제어/생략사유 감사와 구간 밖 의무 부록은 [domain 계약](../../../packages/issus_domain/docs/compact.md)에 따른다.
