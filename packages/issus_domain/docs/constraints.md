# 제약

- 정본: `C:/Users/hika0/.claude/skills/issue-board-collab/scripts/{issue_post,issue_watch,alias_check,compact_prepare}.py`. 함수 범위·SHA-256은 fixture manifest에 고정한다. source 변경은 DECISION 뒤 재고정한다.
- `TYPES` 13개, `STATE`, 허용/필수 키, 오류 문자열·순서, 마커·임계·별칭 regex는 정본과 동일하다. 달력 자동 보정·문자열 trim·본문 LF 변환을 게시 경로에서 추가하지 않는다.
- 문자 수는 Unicode code point다. `splitlines`는 CRLF/C0/NEL/Unicode line separator를 Python처럼 처리한다. BOM은 일반 공백이 아니다. masking의 Unicode word boundary도 Python 기준이다.
- 정본 `checkIssueBody`의 첫 3키 순서 빈틈은 문법 호환으로 유지한다. 서비스 context가 STATE→OWNER→UPDATED를 엄격히 재검사한다. 원본의 예외 입력은 TS 사유로 반환한다.
- legacy pending은 내 모든 TYPE의 RE ∪ 모든 작성자/TYPE의 SUPERSEDES로 해소한다. 여섯 자리 미만 RE는 watcher의 ids()처럼 무시한다. native comment id는 1000000 이상이다.
- 실제 TO의 직접 ACK만 ackState를 전진시킨다. proxy/mention/NOTE·CLAIM의 ACK는 일반 게시를 허용하지만 지시 TO의 delivery를 acked로 만들지 않는다. ACK는 HOLD 해제가 아니다.
- read header는 검증기가 아니다. `_noenv` 원문을 native 실행·ACK 의무·history 정본 경계로 채택하지 않는다. legacy 화면 경계 탐지만 봉투 또는 강한 마커를 쓴다.
- `parseCommentRequest`는 metadata shape·TYPE별 허용만 검사한다. sample 최소 건수/소속, 등록 compactedBy, packetToken의 scope/TTL/revision/through는 P4/P6 snapshot 검사다. raw packet token은 metadata/fact에 저장하지 않는다.
- wire decoder는 unknown key를 버리지 않는다. `parseDomainClientFrame` 성공 뒤 채널 권한·cursor 소유 검사가 필수다. WS mutation은 제공하지 않는다.
- alias near 검사 입력은 owner 전체 registry+tombstone이다. owner lock/동시등록·개명 tx는 서버 책임이다. 구조화 진단의 `case`는 Python 사유 문자열에서는 원본처럼 `exact`로 표기한다.
- baseline 변경은 동결 전 P3만, 동결 뒤 순번+담당명 새 migration으로 한다. root manifest·barrel·타 담당 코드를 수정하지 않는다.
