# 개요

저장소/이슈 목록·상세·inbox와 명시적 댓글/ACK/close를 제공한다. 경로와 고정 locator는 [제약](constraints.md), 전체 기능 범위는 [루트 개요](../../../../../docs/overview.md)다. Markdown은 실행하지 않고 pre로 표시한다.

U1은 /login·/sessions·/repos·/repos/:owner/:repo/issues·/owners/:owner/aliases를 추가/확장한다. Q1 registry는 본문 ROSTER·현재 principal·등록 레지스트리·최근 검사/등록 응답을 구분한다. Q2는 OWNER/참여 별칭/검색/정렬을 서버에서 조회하고 전 페이지 수집 후 작업 STATE/제목순을 적용한다. board/개설/편집은 U2, COMPACT 도우미는 U3 공개 페이지다. 최종 entry/app 조립은 U1/오케스트레이터가 취합한다.

U3 받은편지함은 현재 principal만 대상으로 window/global legacy pending과 직접 ACK waiting을 나누고 원 댓글을 연결한다. 영수·ACK·처리·반영은 각각 서버 결과를 표시한다. COMPACT는 사람이 쓴 요약과 실제 원문 표본을 해당 패킷에 묶으며 자동 요약·외부 작업 성공 추정을 하지 않는다.
