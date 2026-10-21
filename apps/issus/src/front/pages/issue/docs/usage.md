# usage

1. 댓글 raw 또는 TYPE/필드로 작성한다. raw 손실 변환·기존 초안 교체는 확인 후 적용한다. 검사 성공은 게시 확정이 아니다.
2. 422는 오류 요약의 paragraph 순서·원문과 필드 연결을 확인한다. raw 모드는 잘못된 요청도 서버에 보내 실제 사유를 받을 수 있다.
3. ACK는 대화상자의 초안을 검토·수정한 뒤 ACK 게시를 누른다. Esc/취소는 초안을 보존하며 ACK를 만들지 않는다. HOLD/DECISION/RELEASE 빠른 응답은 Composer 초안이다.
4. 편집412에서는 최신 원문과 내 초안을 비교·직접 병합한다. 최신 revision으로 병합 확인 후 문맥 검사를 다시 실행한다.
5. HANDOFF는 후속 이슈 확인→검사→명시 게시→실제 TO ACK→accept→OWNER complete다. 완료 응답 전 책임 해제·OWNER 변경을 표시하지 않는다.
6. 닫기 차단 id는 원문으로 연결한다. ACK만으로 HOLD 해제, DUE 경과만으로 CLAIM 반납을 추정하지 않는다.
7. 게시판은 NOTE/ACK/ALIAS/COMPACT만 선택한다. NOTE 템플릿의 REPLY-IN·최종 REPORT·교훈≤3줄을 채운다. 관리 토큰은 개설 요청 메모리에만 쓰고 입력을 지운다.
