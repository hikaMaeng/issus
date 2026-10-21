# 내부 계약

P5 라우팅 수신자·상태기계·pendingLegacy/ackState·H/A/E cursor의 저장/동시성 계약은 [delivery](delivery.md)에 있다. alias fact sequence와 delivery 투영은 같은 P4 UoW client로 원자 저장한다.

`header`는 `{values, _type, _from, _to, _cc, _re, _sup, _first, _noenv}`다. `values`는 원 봉투 키를 보존하고 underscore 필드는 watcher 정규화 값이다. TYPE 레거시 mapping과 첫 값 우선 중복 처리는 정본대로다.

`pendingLegacy`는 입력 구간에 대한 순수 집합 연산이다. COMMENT·COMPACT를 삭제하지 않는다. `ackState`의 superseded/applied projection 필드는 이미 서버가 권한/근거를 확인했다는 입력 계약이며 이 함수가 권한을 부여하지 않는다. 최초 직접 ACK는 comment bigint 순서로 고정한다.

`transitionDelivery`는 posted/delivered→acked→applied, posted/delivered→superseded만 허용한다. 뒤늦은 receipt/retry는 상태를 후퇴시키지 않는다. posted→acked는 `ackEvidenceReceipt:true`를 반환해 `transport:ack-evidence`를 저장하게 한다. 정보성 delivery는 ACK/apply를 거부한다. 재전달 eligibility는 ackState가 아닌 별도 global legacy pending이다.

`compactDue`는 25댓글/40000자, board30댓글/40000자 및 before-* 사유를 계산한다. generation별 1회 fact·reaction dedupe는 projection/UoW가 책임진다. `mask`는 pem→github-token→aws-key→api-key→bearer→password→email 순서이며 전체 패킷의 최종 1회 치환 수를 반환한다.

정본 regex의 `\s`, `\b`, re.I 차이는 좁은 `pythonRegex` 변환기로 맞춘다. Python re의 decimal/word 및 str.isdigit 범위는 Python 3.13 Unicode 15.1.0 표에서 고정하여 Node의 새 Unicode 문자 추가에 따라 변하지 않는다. 공개 regex 상수의 source line은 constants 주석, Python source hash는 manifest에 있다.

SQL에서 scope는 중복 owner_id+composite FK로 제한한다. comment_counter는 singleton row를 잠그고 같은 tx에서 +1한다. 댓글 중복 hash는 후보 인덱스일 뿐이며 issue lock 아래 실제 bytes 비교가 필요하다. packet0 through는 FK용 NULL generated column으로 표현한다. 도메인→public broker FK는 baseline에 넣지 않는다.

## P4 트랜잭션

접수는 `(principal,idempotency UUID)` 결과 행을 선점하고 PGMQ intake와 함께 커밋한다. 워커는 결과→owner→repo→issue(number 정렬)→comment_counter→event stream 순서로 잠근다. owner 잠금으로 소유자 단위 쓰기를 직렬화하는 보수적 구현이다. tx statement/lock timeout5초, serialization/deadlock만 동일 key로100/300/1000ms 재시도한다. 연결 오류는 원 큐를 보존하도록 호출자에게 전파한다.

도메인 거부는 SAVEPOINT까지 롤백하고 실패 결과만 저장한다. worker의 comment 거부는 본문 대신 SHA256·code·자수만 가진 failure/W `issus.comment.rejected`를 남긴다. 접수 단계 거부와 preflight에는 이 감사 이벤트도 없다. append/send 실패는 거부로 위장하지 않고 결과를 포함한 전체 tx를 롤백한다.

댓글 원문·전체 metadata가 canonical hash에 포함된다. 키 정렬 JSON은 문자열/CRLF/배열 순서를 바꾸지 않는다. 다른 key의 같은 issue/body/논리 author는 전체 이력에서 실제 문자열까지 비교해409다. fact UUID는 principal scope+key+논리 label로 생성하여 서로 다른 principal의 같은 UUID를 구별한다.

댓글 tx가 reference·directive/directive_recipient·직접 ACK·CLAIM/RELEASE·HOLD 해제·pending handoff를 즉시 갱신한다. ACK/NOTE/REPORT의 legacy 해소와 실제 TO 직접 ACK를 합치지 않는다. source OWNER의 handoff.complete는 명시 acceptance 뒤만 허용한다. cross-issue 이관은 source OWNER를 감사상 보존하고 STATE:cancelled/REPLY-IN을 갱신한다. 같은 이슈 이관은 OWNER만 변경한다.

close는 terminal STATE·최종 REPORT·신선한 COMPACT·강화 미ACK0·HOLD0·CLAIM0·pending handoff0을 검사한다. 위반은409 CLOSE_BLOCKED이며 경고만 남기고 닫지 않는다. 성공하면 닫기 fact/본문/revision과 열린 board 완료 NOTE가 함께 커밋한다. 별칭 개명은 기존 stable id를 유지하고 old name tombstone을 추가하며 OWNER 본문과 revision도 함께 갱신한다.

반응 소비자는 `verifyReactionSource`로 원 fact의 eventId/stream/sequence/action/owner를 조회·대조하고 `applyProjection`으로 `(projection,sourceEventId)`를 기록한다. 반응 envelope의 새 sequence나 react eventId를 원본 좌표로 쓰지 않는다.

P6는 매번 comment 원문을 재계산하며 compact_segment는 캐시/발행 이력이다. publication이 다음 generation을 먼저 reset한 뒤 P4 pointer/fact를 같은 tx로 저장한다. 늦은 source 반응도 현재 pointer에서 계산한다. JSONB hash는 canonical key 정렬로 검증한다.
