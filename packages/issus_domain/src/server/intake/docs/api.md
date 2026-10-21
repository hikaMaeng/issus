# P4 후속 API

`IntakeOptions.refreshCompactSegment?(tx, issue, 'before-close')`는 close 전 관측 hook이다. 기본 구현은 P6 `refreshCompactSegment`이며 닫기 명령 tx와 분리된 제어 tx에서 호출한다. 호출자는 COMMIT을 직접 수행하지 않는다.

`rebuildAliasProfiles(tx, ownerId, facts)`는 정본 registered/renamed fact를 재생 순서대로 받아 stable alias와 개명 tombstone의 role/model/scope를 복원한다. ID·이름·멤버십·세션 투영을 먼저 복원한 상태가 전제다. identity가 없으면 `ALIAS_REBUILD_IDENTITY_REQUIRED`, owner/shape 불일치는 `INVALID_ALIAS_FACT`이며 model을 빈 문자열로 추측하지 않는다. 이미 복원된 투영에 재실행해도 같은 프로필이다.

`issus.alias.registered/renamed`의 `model:string`은 필수다. repo의 system 예약은 service, board 예약은 실제 alias 행의 model을 기록한다.
