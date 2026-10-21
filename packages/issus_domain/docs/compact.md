# COMPACT

P6 경계는 `src/server/compact/{segment,packet,publication}`다. P4의 comment 삽입·pointer·revision·posted facts에 publication을 주입하고, P5 compact queue에는 reaction을 주입한다. 새 LLM 호출·새 command action·migration은 없다.

## 구간과 due

`sinceCompactStats`는 native pointer 이후 댓글의 전체 codepoint(봉투/LF 포함)를 다시 계산한다. 일반 25댓글 또는 40,000자, board 30댓글 또는 40,000자다. native COMPACT 수가 generation이며 `compact_segment.due_reasons`는 같은 generation의 threshold를 한 번만 발행한다. purpose before-decision/handoff/close도 generation별 한 번이다.

`applyCompactReaction(tx,input)`은 P4 source eventId/stream/sequence/owner/action 대조와 `compact.segment.v1` dedupe를 한 tx로 수행한다. 늦게 온 원 사건도 현재 pointer에서 재계산하므로 reset을 되돌리지 않는다. fact는 `issus.compact.due`, audience=worker, channel=internal:compact, OWNER는 payload.ownerAliasId다. inbox/전달은 P5 소유다.

segment를 재구축하면 같은 generation의 기존 due fact에서 발행 사유를 복원한다. 원 댓글 재계산·projection 재생이 이미 게시한 due를 다시 발행하지 않는다.

## 패킷

`CompactService.packet`은 REPEATABLE READ에서 본문 첫 줄·이전 COMPACT(없으면 본문)·이후 댓글 id/createdAt/envelope/body·통계·제안 봉투·through/revision을 고정한다. 구간0/제어변경0이면 null→HTTP204. 제어만 바뀌면 이전 through를 유지한다.

부록은 pendingLegacy.window/global·ackState·activeHolds·claims·handoffs를 별도로 유지하고 원 id 조회 링크를 붙인다. 본문·이관·재개 변경과 compactDeferredReason 감사 원 fact는 controlFactsSinceCompact다. 열린 의무는 COMPACT로 삭제하지 않는다.

정본 MASKS의 pem→github-token→aws-key→api-key→bearer→password→email 순서를 재사용한다. markdown 전체에 1회 적용해 중복 header/봉투도 마스킹한다. maskedCount는 이 최종 패스만 세며 chars는 원문 통계다. JSON의 문자열 필드도 같은 MASKS를 적용한다. Python reference fixture는 마스킹 보강이 필요 없는 동일 입력에서 byte 동치를 검증하고 ROT13 masks 29건을 별도로 대조한다.

`compact_packet`에는 UUID·token_hash·마스킹 snapshot·canonical SHA-256·owner/issue/prev/through/revision·24h 만료만 저장한다. raw token은 API 발급 응답에만 있다. GET token은 CSPRNG 32byte다. prepare 응답은 random operation UUID+packet UUID의 SHA-256으로 opaque token을 복원하여 원 응답을 재생하며 command_result에는 packetId/status만 저장한다. packet token은 인증을 대체하지 않는다.

## 게시

POST comments의 최상위는 body/compactPacketToken/sampledIds/compactedBy/compactDeferredReason만 허용한다. P3 parser와 P4 admission·preflight·worker 검사를 그대로 쓴다. COMPACT는 OWNER FROM·TO:ALL·전체≤2000자·강한 marker 줄2·through=SEEN·실제 issue·현재 마지막 댓글/revision·24h·RE 체인·표본 최소3(3건 미만 전부)·등록 compactor와 footer 일치를 검사한다.

P6 `compactPublication`은 삽입 직후 같은 tx에서 snapshot hash/OWNER/구간 증거를 대조하고 generation을 reset한다. P4가 comment.posted·compact.posted·본문 COMPACT/UPDATED·revision을 한 tx로 저장한다. append나 queue 실패도 comment/pointer/segment/result까지 롤백한다. stale409·만료410·문법/metadata422다.

## 공개 API

| export | 계약 |
| --- | --- |
| CompactService(uow) | status(p,repoId,number), packet(p,repoId,number), prepare(p,repoId,number,purpose,key), react(input) |
| compactPublication | P4 CompactPublication 그대로 주입 |
| applyCompactReaction | (tx,ReactionCoordinates)→Promise<boolean> |
| refreshCompactSegment | (tx,IssueRow,purpose?)→CompactStatus, 호출자가 issue lock 보유 |
| lockCompactIssue | owner→repo→issue 순서 잠금 |
| readCompactHistory | P4 historyReader 시그니처, compact 원문과 compactStatus 통계를 분리 |
| compactPacketFilename | (owner/repo,number,throughId)→정본 기본 --out 파일명 |

P4 기본 history의 sinceCompact는 true다. native pointer만 경계로 사용하고 페이지 snapshot의 이전 pointer를 유지한다. P6 wrapper는 diagnostics.compact가 원문을 덮는 P4 응답을 보완한다. P5 union reader가 연결되면 P5가 경계를 보존한다. close 요청의 before-close 접점은 ASK 6309953030으로 P4 소유자 조립을 요청했다.
