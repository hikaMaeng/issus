# overview

issus 소유 모듈. [설계](../../../docs/design.md) §9·§11을 따른다.

P4 핵심 API는 저장소·별칭·세션·이슈·댓글·본문 교체·게시판·이관·닫기·문법검사·preflight·operation 조회다. 구독/push/receipt·compact 패킷·UI 기능은 후속 소유자가 연결한다. 독립 하네스의 PASS를 production 조립·배포 PASS로 표시하지 않는다.

P6 compact HTTP는 상태 조회·purpose 준비·JSON/markdown packet을 제공한다. 게시 결과는 기존 comments/operations 경로로 확인한다. 자동 LLM 요약은 없다.
