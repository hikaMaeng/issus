# 개요

`common/protocol/{repo,issue,comment,envelope,alias,session,delivery,subscription,compact,board,handoff,inbox,adapter,runtime}`가 issus wire 타입의 단일 정본이다. `validation`은 정본 Python과 같은 사유 배열을 반환하고 `logic`은 DB/시계/네트워크 없이 계산한다.

`server/backend/schema/0001-domain-baseline.sql`은 `issus` schema만 소유한다. P4 runtime 적용기가 broker `public` schema와 함께 배포 순서를 관리한다. HTTP 핸들러·migration 실행기는 다른 package/app 경계다.

P4 backend/intake는 외부 명령 접수와 worker 종결을 분리한다. 투영·안전 인덱스·중요 fact·반응 큐·명령 결과를 동일 tx로 처리하고, read-only preflight는 같은 검사기만 실행한다. P5 delivery/scheduling과 P6 compact packet/projection은 이 공개 API를 호출한다.

`tests/fixtures/issue-board-v2`는 32 good(28 comment/4 issue-body), 5 bad, 9 flows의 원본 바이트와 검증 golden을 보존한다. flows는 여러 댓글을 담는 참고 문서이며 단일 댓글로 검증하지 않는다.
