# internals

readThread는 첫 응답의 nextCursor를 끝까지 소비하고 decimal id로 dedup한다. 서버 priority를 보존하며 OTHER 추가 GET은 펼칠 때만 한다. 새 COMPACT가 도착하면 이전 boundary를 pinnedHistory로 유지하고 명시 적용 전 초안·포커스를 건드리지 않는다.

WriteAttempt는 client·path·options·UUID key를 결과 확정까지 고정한다. 연결 불명/OperationTimeout은 같은 요청을 확인한다. definitive4xx 후 수정 payload는 새 key를 받는다. accepted operationId는 별도 상태 영역에 표시하며 성공을 추정하지 않는다. bearer를 저장·로그·URL·DOM에 출력하지 않는다.

parseDraft는 원문과 직렬화가 동일할 때만 lossless다. unknown/reordered/duplicate key·CRLF 등은 무손실로 가장하지 않는다. 정본 REQUIRED/TYPES/STATES·canonical parser를 재사용하고 추가 UI 요구 표는 서버 검증을 대체하지 않는다. 오류 매핑은 정확 path 또는 정본 필수키 문장만 사용한다.

IssueForm은 revision과 ETag를 서버 성공 뒤 갱신한다. conflict는 base를 자동 바꾸지 않는다. 구조화 OWNER/포인터는 보호하고 raw 변경은 되돌리지 않아 서버 HANDOFF_REQUIRED/POINTER_MANAGED를 확인할 수 있다.
