# architecture

- Issue/IssueContent: 서버 상세·고정 pagination·5초 보조 갱신·P7 WS 구독. 갱신 때 Composer를 unmount하지 않는다. 새 COMPACT는 안내 후 명시 적용한다.
- Envelope/ReferenceLink: dl 하나와 원 id 링크. 현재 article 포커스 또는 단건 원문 native dialog. 본문·참조 원문은 inert pre다.
- Composer: raw 문자열이 최종 요청. 구조화 적용은 명시 행동이며 손실 round-trip은 확인한다. QuickReply는 초안/미리보기와 실제 ACK 게시를 분리한다.
- IssueForm: 개설 문법 검사, 수정 If-Match, 412 원문 비교·명시 병합·재검사.
- Closing/Handoff: 진단과 성공 여부는 서버 응답만 사용한다. ACK·accept·complete를 구분한다.
- Board: registry 발견만 채택하고 IssueContent를 재사용한다.

색·크기 literal 추가 없음. U1 CSS 변수만 사용한다. 기능 간 import는 공개 index만 소비한다. 공통·U3 폴더 편집 없음.
